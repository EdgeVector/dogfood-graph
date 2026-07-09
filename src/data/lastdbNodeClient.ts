import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import http from "node:http";

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
  key?: { hash?: string | null; range?: string | null };
  fields: T;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 1000;
const PAGE_LIMIT = 1000;
const SOCKET_FILE_NAME = "folddb.sock";
const FULL_SOCKET_FILE_NAME = "folddb-full.sock";

const DATA_ROUTES = new Set([
  "GET /api/schemas",
  "GET /api/system/auto-identity",
  "POST /api/query",
  "POST /api/mutation",
]);

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

  constructor(options: LastDbNodeClientOptions = {}) {
    this.socketPath = defaultLastDbSocketPath(options.socketPath);
    this.userHash = options.userHash;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    await this.ensureUserHash();
    await this.request("POST", "/api/mutation", {
      type: "mutation",
      schema: schemaName,
      fields_and_values: applyFieldMapper(record, fieldMapper),
      key_value: { hash: keyHash, range: null },
      mutation_type: mutationType,
    });
  }

  async deleteRecord(schemaName: string, keyHash: string) {
    await this.ensureUserHash();
    await this.request("POST", "/api/mutation", {
      type: "mutation",
      schema: schemaName,
      fields_and_values: {},
      key_value: { hash: keyHash, range: null },
      mutation_type: "delete",
    });
  }

  async queryAll<T = Record<string, unknown>>(
    schemaName: string,
    fields: string[],
    fieldMapper?: LastDbFieldMapper,
  ) {
    await this.ensureUserHash();
    const requestFields = fields.map((field) => fieldMapper?.[field] ?? field);
    const rows: QueryRow<T>[] = [];
    const seen = new Set<string>();
    let offset = 0;
    for (let page = 0; page < PAGE_LIMIT; page += 1) {
      const body = await this.request<{
        results?: QueryRow<T>[];
        data?: { results?: QueryRow<T>[] };
        has_more?: boolean;
      }>("POST", "/api/query", {
        schema_name: schemaName,
        fields: requestFields,
        limit: PAGE_SIZE,
        offset,
      });
      const pageRows = body.data?.results ?? body.results ?? [];
      let added = 0;
      for (const row of pageRows) {
        const key = row.key?.hash ?? JSON.stringify(row.fields);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ...row,
          fields: reverseFieldMapper(
            row.fields as Record<string, unknown>,
            fieldMapper,
          ) as T,
        });
        added += 1;
      }
      if (body.has_more !== true || pageRows.length === 0 || added === 0) break;
      offset += pageRows.length;
    }
    return rows;
  }

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
    if (DATA_ROUTES.has(route)) return this.socketPath;
    const fullSocketPath = join(dirname(this.socketPath), FULL_SOCKET_FILE_NAME);
    return existsSync(fullSocketPath) ? fullSocketPath : this.socketPath;
  }
}
