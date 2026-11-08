import { existsSync } from "node:fs";
import { join } from "node:path";
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
  timeoutMs?: number;
  /**
   * Inject the SDK data-plane transport (query/mutation). Production leaves
   * it unset and the client builds a Unix-domain-socket transport.
   */
  transport?: SdkTransport;
};

export type LastDbSchemaMap = Record<DogfoodSchemaName, string>;

export type QueryRow<T = Record<string, unknown>> = {
  key?: KeyValue | null;
  fields: T;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 1000;
const SOCKET_FILE_NAME = "folddb.sock";

// The SDK LastDbClient constructor still requires a capability store.
// This client does not use capability tokens.
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
  if (override) return override;
  return join(process.env.HOME ?? ".", ".lastdb", "data", SOCKET_FILE_NAME);
}

export class LastDbNodeClient {
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly injectedTransport?: SdkTransport;
  private dataClient?: LastDbClient;

  constructor(options: LastDbNodeClientOptions = {}) {
    this.socketPath = defaultLastDbSocketPath(options.socketPath);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.injectedTransport = options.transport;
  }

  get transport() {
    return { socketPath: this.socketPath, exists: existsSync(this.socketPath) };
  }

  async autoIdentity() {
    return this.request<Record<string, unknown>>("GET", "/api/system/auto-identity");
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

  async declareSchema(schema: SchemaDefinition) {
    const mapped = await this.request<{
      canonical?: string;
      schema?: string;
      data?: { canonical?: string; schema?: string };
    }>("POST", "/api/apps/declare-schema", {
      app_id: DOGFOOD_GRAPH_APP_ID,
      schema,
    });
    const data = mapped.data;
    const canonical = data?.canonical ?? mapped.canonical;
    const localSchema = data?.schema ?? mapped.schema;
    if (typeof canonical === "string" && canonical.length > 0) return canonical;
    if (typeof localSchema === "string" && localSchema.length > 0) return localSchema;
    throw new Error(`LastDB returned no runtime schema name for ${schema.name}`);
  }

  async putRecord(
    schemaName: string,
    record: Record<string, unknown>,
    keyHash: string,
    mutationType: "create" | "update" = "create",
  ) {
    const client = await this.data();
    await client.mutate(schemaName, {
      mutationType,
      fields: record as SdkQueryRow["fields"],
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
  ): Promise<QueryRow<T>[]> {
    const client = await this.data();
    const result = await client.queryAll(
      schemaName,
      { fields },
      { pageSize: PAGE_SIZE, allowFullScan: true },
    );
    return result.rows.map((row) => ({
      key: row.keyValue,
      fields: row.fields as T,
    }));
  }

  // Build (once) the SDK LastDbClient for query and mutation. It uses the
  // Unix socket. The constructor still takes a no-op capability store because
  // this vendored SDK requires one. The data routes do not use a token.
  private async data(): Promise<LastDbClient> {
    if (this.dataClient) return this.dataClient;
    const transport =
      this.injectedTransport ??
      udsTransport(this.socketPath, {
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

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const result = await this.tryRequest<T>(method, path, body);
    if (result.ok) return result.body;
    let detail = JSON.stringify(result.body);
    if (result.body && typeof result.body === "object") {
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

  // Owner routes this client still speaks over the node's socket: identity
  // (`/api/system/auto-identity`) and schema registration
  // (`/api/apps/declare-schema`). Query and mutation go through the SDK on
  // the same socket.
  private rawRequest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const socketPath = this.socketPath;
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
}
