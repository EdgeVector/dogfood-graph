import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import http from "node:http";

import {
  LastDbClient,
  capabilityStoreKey,
  udsTransport,
  type CapabilityStore,
  type KeyValue,
  type QueryRow as SdkQueryRow,
  type Transport as SdkTransport,
} from "@lastdb/app-sdk";

import {
  DOGFOOD_GRAPH_APP_ID,
  dogfoodSchemas,
  type DogfoodSchemaName,
} from "./dogfoodSchemas.ts";
import type { SchemaDefinition } from "./schemaTypes.ts";

export type LastDbNodeClientOptions = {
  socketPath?: string;
  userHash?: string;
  timeoutMs?: number;
  /**
   * Inject the SDK data-plane transport (query/mutation). Tests pass a mock
   * {@link SdkTransport} to exercise the mapper + pagination glue without a
   * live node; production leaves it unset and the client builds a
   * Unix-domain-socket transport over {@link socketPath}.
   */
  transport?: SdkTransport;
};

export type LastDbSchemaMap = Record<DogfoodSchemaName, string>;

// Field renames the node's materialized schema expects, keyed by app-local
// field name (e.g. `goal_revision_id` -> `current_goal_revision_id`). The
// schema service unifies same-purpose fields onto one canonical name when a
// schema is registered through it and reports the renames as
// `mutation_mappers`; writers must apply them or mutations fail with
// `unknown_fields`. Nodes that materialize app-declared schemas verbatim
// produce no mappers, so an absent/empty mapper is a no-op.
export type LastDbFieldMapper = Record<string, string>;

export type LastDbFieldMapperMap = Partial<Record<DogfoodSchemaName, LastDbFieldMapper>>;

export type LastDbRuntimeSchema = {
  name?: string;
  identity_hash?: string;
  fields?: string[];
};

const FIELD_ALIASES: Record<string, string[]> = {
  goal_revision_id: ["current_goal_revision_id"],
  base_goal_revision_id: ["current_goal_revision_id"],
  screenshot_ids: ["screenshot_id"],
};

export function applyFieldMapper(
  record: Record<string, unknown>,
  mapper: LastDbFieldMapper | undefined,
): Record<string, unknown> {
  if (!mapper || Object.keys(mapper).length === 0) return record;
  return Object.fromEntries(
    Object.entries(record).map(([field, value]) => [mapper[field] ?? field, value]),
  );
}

export function reverseFieldMapper(
  record: Record<string, unknown>,
  mapper: LastDbFieldMapper | undefined,
): Record<string, unknown> {
  if (!mapper || Object.keys(mapper).length === 0) return record;
  const reversed = Object.fromEntries(
    Object.entries(mapper).map(([appField, nodeField]) => [nodeField, appField]),
  );
  return Object.fromEntries(
    Object.entries(record).map(([field, value]) => [reversed[field] ?? field, value]),
  );
}

export function inferFieldMapper(
  appFields: readonly string[],
  runtimeFields: readonly string[],
): LastDbFieldMapper {
  const runtime = new Set(runtimeFields);
  const entries = appFields.flatMap((field): [string, string][] => {
    if (runtime.has(field)) return [];
    const aliases = [
      ...(FIELD_ALIASES[field] ?? []),
      ...(field.endsWith("_goal_revision_id") ? ["current_goal_revision_id"] : []),
      ...(field.endsWith("_ids") ? [field.slice(0, -1)] : []),
    ];
    const match = aliases.find((alias) => runtime.has(alias));
    return match ? [[field, match]] : [];
  });
  return Object.fromEntries(entries);
}

export function mergeFieldMapperMaps(
  ...maps: LastDbFieldMapperMap[]
): LastDbFieldMapperMap {
  const merged: LastDbFieldMapperMap = {};
  for (const map of maps) {
    for (const [schema, mapper] of Object.entries(map) as [
      DogfoodSchemaName,
      LastDbFieldMapper | undefined,
    ][]) {
      if (!mapper || Object.keys(mapper).length === 0) continue;
      merged[schema] = { ...(merged[schema] ?? {}), ...mapper };
    }
  }
  return merged;
}

export type QueryRow<T = Record<string, unknown>> = {
  key?: KeyValue | null;
  fields: T;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 1000;
const SOCKET_FILE_NAME = "folddb.sock";
const FULL_SOCKET_FILE_NAME = "folddb-full.sock";

// Owner-only routes this client still speaks hand-rolled over the node's
// control socket. These are NOT part of the app data plane the SDK covers
// (query/mutation/scoped-search): they are node-owner surface — identity
// bootstrap (`auto-identity`), schema registration (`declare`), and the owner
// schema listing used to infer field mappers. The SDK deliberately models only
// the app data plane (capability-scoped query/mutate/search), so these owner
// verbs stay local; each is justified in the port PR body.
const OWNER_DATA_ROUTES = new Set([
  "GET /api/schemas",
  "GET /api/system/auto-identity",
]);

// A no-op capability store: this client authenticates as the node owner via the
// `X-User-Hash` header on its Unix-domain transport, not via an app capability
// token, so there is nothing to persist or replay. The SDK's `LastDbClient`
// still requires a store to satisfy its constructor; this fulfills the
// interface without touching any keychain/file.
const noopCapabilityStore: CapabilityStore = {
  async store() {},
  async load() {
    return null;
  },
  async remove() {},
};

export function defaultLastDbSocketPath(override?: string): string {
  if (process.env.DOGFOOD_GRAPH_LASTDB_SOCKET) {
    return process.env.DOGFOOD_GRAPH_LASTDB_SOCKET;
  }
  if (process.env.FOLDDB_SOCKET_PATH) return process.env.FOLDDB_SOCKET_PATH;
  if (process.env.FBRAIN_FOLDDB_SOCKET) return process.env.FBRAIN_FOLDDB_SOCKET;
  if (override) return override;
  return join(process.env.HOME ?? ".", ".folddb", "data", SOCKET_FILE_NAME);
}

export class LastDbNodeClient {
  private readonly socketPath: string;
  private userHash?: string;
  private readonly timeoutMs: number;
  private readonly injectedTransport?: SdkTransport;
  private dataClient?: LastDbClient;

  constructor(options: LastDbNodeClientOptions = {}) {
    this.socketPath = defaultLastDbSocketPath(options.socketPath);
    this.userHash = options.userHash;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.injectedTransport = options.transport;
  }

  get transport() {
    return { socketPath: this.socketPath, exists: existsSync(this.socketPath) };
  }

  async autoIdentity() {
    const body = await this.request<Record<string, unknown>>(
      "GET",
      "/api/system/auto-identity",
    );
    const userHash = body.user_hash;
    if (typeof userHash === "string" && userHash.length > 0) {
      this.userHash = userHash;
    }
    return body;
  }

  async ensureUserHash() {
    if (this.userHash) return this.userHash;
    await this.autoIdentity();
    if (!this.userHash) {
      throw new Error("LastDB auto-identity did not return user_hash");
    }
    return this.userHash;
  }

  async declareDogfoodSchemas() {
    const entries: [DogfoodSchemaName, string][] = [];
    for (const [schemaName, schema] of Object.entries(dogfoodSchemas) as [
      DogfoodSchemaName,
      SchemaDefinition,
    ][]) {
      const runtimeName = await this.declareSchema(schema);
      entries.push([schemaName, runtimeName]);
    }
    return Object.fromEntries(entries) as LastDbSchemaMap;
  }

  async listSchemas(): Promise<LastDbRuntimeSchema[]> {
    await this.ensureUserHash();
    const body = await this.request<{
      schemas?: LastDbRuntimeSchema[];
      data?: { schemas?: LastDbRuntimeSchema[] };
    }>("GET", "/api/schemas");
    return body.data?.schemas ?? body.schemas ?? [];
  }

  async inferFieldMappers(schemas: LastDbSchemaMap): Promise<LastDbFieldMapperMap> {
    const runtimeSchemas = await this.listSchemas();
    const entries = (Object.entries(schemas) as [DogfoodSchemaName, string][]).flatMap(
      ([schemaName, runtimeName]): [DogfoodSchemaName, LastDbFieldMapper][] => {
        const runtimeSchema = runtimeSchemas.find(
          (schema) => schema.name === runtimeName || schema.identity_hash === runtimeName,
        );
        const mapper = inferFieldMapper(
          dogfoodSchemas[schemaName].fields,
          runtimeSchema?.fields ?? [],
        );
        return Object.keys(mapper).length > 0 ? [[schemaName, mapper]] : [];
      },
    );
    return Object.fromEntries(entries) as LastDbFieldMapperMap;
  }

  async declareSchema(schema: SchemaDefinition) {
    await this.ensureUserHash();
    const direct = await this.tryRequest<{ data?: { schema_name?: string }; schema_name?: string }>(
      "POST",
      "/api/schemas/declare",
      {
        namespace: DOGFOOD_GRAPH_APP_ID,
        schema,
      },
    );
    if (direct.ok) {
      return direct.body.data?.schema_name ?? direct.body.schema_name ?? `${DOGFOOD_GRAPH_APP_ID}/${schema.name}`;
    }

    const mapped = await this.request<{
      canonical?: string;
      schema?: string;
      data?: { canonical?: string; schema?: string };
    }>("POST", "/api/apps/declare-schema", {
      app_id: DOGFOOD_GRAPH_APP_ID,
      schema,
    });
    const canonical = mapped.data?.canonical ?? mapped.canonical;
    const localSchema = mapped.data?.schema ?? mapped.schema;
    if (typeof canonical === "string" && canonical.length > 0) return canonical;
    if (typeof localSchema === "string" && localSchema.length > 0) return localSchema;
    throw new Error(`LastDB returned no runtime schema name for ${schema.name}`);
  }

  async putRecord(
    schemaName: string,
    record: Record<string, unknown>,
    keyHash: string,
    mutationType: "create" | "update" = "create",
    fieldMapper?: LastDbFieldMapper,
  ) {
    const client = await this.data();
    await client.mutate(schemaName, {
      mutationType,
      fields: applyFieldMapper(record, fieldMapper) as SdkQueryRow["fields"],
      key: { hash: keyHash, range: null },
    });
  }

  async deleteRecord(schemaName: string, keyHash: string) {
    const client = await this.data();
    await client.mutate(schemaName, {
      mutationType: "delete",
      fields: {},
      key: { hash: keyHash, range: null },
    });
  }

  async queryAll<T = Record<string, unknown>>(
    schemaName: string,
    fields: string[],
    fieldMapper?: LastDbFieldMapper,
  ): Promise<QueryRow<T>[]> {
    const client = await this.data();
    const requestFields = fields.map((field) => fieldMapper?.[field] ?? field);
    const result = await client.queryAll(
      schemaName,
      { fields: requestFields },
      { pageSize: PAGE_SIZE, allowFullScan: true },
    );
    return result.rows.map((row) => ({
      key: row.keyValue,
      fields: reverseFieldMapper(row.fields, fieldMapper) as T,
    }));
  }

  // --- SDK data plane ------------------------------------------------------

  // Build (once) the SDK `LastDbClient` that carries the app data plane
  // (query/queryAll/mutation). It rides a Unix-domain-socket transport with the
  // node-owner `X-User-Hash` header, so the node resolves the caller as the
  // owner exactly as the hand-rolled client did. The client is constructed
  // directly (no `connect()` consent handshake) with a no-op capability store:
  // a local owner tool holds no app capability token, and the data routes it
  // uses do not require one.
  private async data(): Promise<LastDbClient> {
    if (this.dataClient) return this.dataClient;
    await this.ensureUserHash();
    const transport =
      this.injectedTransport ??
      udsTransport(this.socketPath, {
        "X-User-Hash": this.userHash as string,
        "X-LastDB-Client": "dogfood-graph",
      });
    this.dataClient = new LastDbClient(
      DOGFOOD_GRAPH_APP_ID,
      transport,
      noopCapabilityStore,
      null,
      capabilityStoreKey(DOGFOOD_GRAPH_APP_ID, transport.target),
      transport.target,
    );
    return this.dataClient;
  }

  // --- Owner-only hand-rolled transport ------------------------------------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const result = await this.tryRequest<T>(method, path, body);
    if (result.ok) return result.body;
    let detail = JSON.stringify(result.body);
    if (result.body && typeof result.body === "object") {
      // Error bodies carry a short `error` code plus an optional human
      // `message` (e.g. unknown_fields lists the offending fields there).
      const parts = ["error", "message"]
        .map((key) => (result.body as Record<string, unknown>)[key])
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      if (parts.length > 0) detail = parts.join(": ");
    }
    throw new Error(`LastDB ${method} ${path} failed with ${result.status}: ${detail}`);
  }

  private async tryRequest<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ ok: true; status: number; body: T } | { ok: false; status: number; body: unknown }> {
    const response = await this.rawRequest(method, path, body);
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status, body: response.body as T };
    }
    return { ok: false, status: response.status, body: response.body };
  }

  private rawRequest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const socketPath = this.socketFor(method, path);
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath,
          method,
          path,
          timeout: this.timeoutMs,
          headers: {
            "X-LastDB-Client": "dogfood-graph",
            ...(this.userHash ? { "X-User-Hash": this.userHash } : {}),
            ...(encodedBody
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(encodedBody),
                }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: unknown = null;
            if (text.length > 0) {
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = text;
              }
            }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`LastDB request timed out after ${this.timeoutMs}ms`)));
      req.on("error", reject);
      if (encodedBody) req.write(encodedBody);
      req.end();
    });
  }

  private socketFor(method: string, path: string) {
    const route = `${method.toUpperCase()} ${path.split(/[?#]/, 1)[0]}`;
    if (OWNER_DATA_ROUTES.has(route)) return this.socketPath;
    const fullSocketPath = join(dirname(this.socketPath), FULL_SOCKET_FILE_NAME);
    return existsSync(fullSocketPath) ? fullSocketPath : this.socketPath;
  }
}
