import {
  DOGFOOD_GRAPH_APP_ID,
  dogfoodSchemaList,
  type DogfoodSchemaName,
} from "./dogfoodSchemas";
import type { AppSchemaDeclaration, SchemaDefinition } from "./schemaTypes";

export type LastDbClientOptions = {
  baseUrl?: string;
  userHash?: string;
  fetchImpl?: typeof fetch;
};

export type QueryRow<T> = {
  key?: unknown;
  fields: T;
};

export class LastDbClient {
  private readonly baseUrl: string;
  private readonly userHash: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LastDbClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
    this.userHash = options.userHash ?? "dogfood-graph-local";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async declareAppSchema(schema: SchemaDefinition) {
    return this.request<AppSchemaDeclaration>("/api/apps/declare-schema", {
      method: "POST",
      body: JSON.stringify({
        app_id: DOGFOOD_GRAPH_APP_ID,
        schema,
      }),
    });
  }

  async declareDogfoodSchemas() {
    const declarations = await Promise.all(
      dogfoodSchemaList.map((schema) => this.declareAppSchema(schema)),
    );
    return Object.fromEntries(
      declarations.map((declaration) => [declaration.schema, declaration]),
    ) as Record<DogfoodSchemaName, AppSchemaDeclaration>;
  }

  async createRecord<T extends Record<string, unknown>>(
    schema: DogfoodSchemaName,
    fields: T,
    keyHash: string,
  ) {
    await this.mutate(schema, "create", fields, keyHash);
  }

  async updateRecord<T extends Record<string, unknown>>(
    schema: DogfoodSchemaName,
    fields: T,
    keyHash: string,
  ) {
    await this.mutate(schema, "update", fields, keyHash);
  }

  async deleteRecord(schema: DogfoodSchemaName, keyHash: string) {
    await this.mutate(schema, "delete", {}, keyHash);
  }

  async query<T>(schema: DogfoodSchemaName, fields: string[]) {
    const response = await this.request<{ data?: { results?: QueryRow<T>[] } }>(
      "/api/query",
      {
        method: "POST",
        body: JSON.stringify({ schema, fields }),
      },
    );
    return response.data?.results ?? [];
  }

  private async mutate<T extends Record<string, unknown>>(
    schema: DogfoodSchemaName,
    mutationType: "create" | "update" | "delete",
    fields: T,
    keyHash: string,
  ) {
    await this.request("/api/mutation", {
      method: "POST",
      body: JSON.stringify({
        schema,
        mutation_type: mutationType,
        fields_and_values: fields,
        key: { hash: keyHash, range: null },
      }),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-User-Hash": this.userHash,
        "X-LastDB-Client": "dogfood-graph",
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : `LastDB request failed with status ${response.status}`;
      throw new Error(message);
    }
    return body as T;
  }
}
