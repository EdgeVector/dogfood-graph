import { LastDbClient } from "./lastdbClient";
import type { DogfoodSchemaName } from "./dogfoodSchemas";
import type { DogfoodRecordMap } from "./types";

const idFields = {
  DogfoodFlow: "dogfoodFlow_id",
  GoalRevision: "goalRevision_id",
  UxNode: "uxNode_id",
  UxEdge: "uxEdge_id",
  DogfoodSession: "dogfoodSession_id",
  Observation: "observation_id",
  ScreenshotAsset: "screenshotAsset_id",
  ScreenshotAnnotation: "screenshotAnnotation_id",
  DiffItem: "diffItem_id",
  DagChangeProposal: "dagChangeProposal_id",
} as const satisfies Record<DogfoodSchemaName, string>;

export type RecordRepository<T> = {
  create(record: T): Promise<T>;
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
};

export type DogfoodRepositories = {
  [Name in DogfoodSchemaName]: RecordRepository<DogfoodRecordMap[Name]>;
};

export class ImmutableRecordError extends Error {
  constructor(schema: string) {
    super(`${schema} records are immutable`);
  }
}

export class MemoryRecordRepository<
  Name extends DogfoodSchemaName,
> implements RecordRepository<DogfoodRecordMap[Name]>
{
  private readonly records = new Map<string, DogfoodRecordMap[Name]>();

  constructor(private readonly schema: Name) {}

  async create(record: DogfoodRecordMap[Name]) {
    const id = this.idOf(record);
    this.records.set(id, structuredClone(record));
    return structuredClone(record);
  }

  async get(id: string) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async list() {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async update(id: string, patch: Partial<DogfoodRecordMap[Name]>) {
    if (this.schema === "GoalRevision") {
      throw new ImmutableRecordError(this.schema);
    }
    const existing = this.records.get(id);
    if (!existing) throw new Error(`${this.schema} ${id} not found`);
    const next = { ...existing, ...patch } as DogfoodRecordMap[Name];
    this.records.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async delete(id: string) {
    this.records.delete(id);
  }

  private idOf(record: DogfoodRecordMap[Name]) {
    const idField = idFields[this.schema];
    const id = (record as Record<string, unknown>)[idField];
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${this.schema} record is missing ${String(idField)}`);
    }
    return id;
  }
}

export class LastDbRecordRepository<
  Name extends DogfoodSchemaName,
> implements RecordRepository<DogfoodRecordMap[Name]>
{
  constructor(
    private readonly schema: Name,
    private readonly fields: string[],
    private readonly client: LastDbClient,
  ) {}

  async create(record: DogfoodRecordMap[Name]) {
    await this.client.createRecord(
      this.schema,
      record as Record<string, unknown>,
      this.idOf(record),
    );
    return record;
  }

  async get(id: string) {
    const rows = await this.list();
    return rows.find((record) => this.idOf(record) === id);
  }

  async list() {
    const rows = await this.client.query<DogfoodRecordMap[Name]>(
      this.schema,
      this.fields,
    );
    return rows.map((row) => row.fields);
  }

  async update(id: string, patch: Partial<DogfoodRecordMap[Name]>) {
    if (this.schema === "GoalRevision") {
      throw new ImmutableRecordError(this.schema);
    }
    const existing = await this.get(id);
    if (!existing) throw new Error(`${this.schema} ${id} not found`);
    const next = { ...existing, ...patch } as DogfoodRecordMap[Name];
    await this.client.updateRecord(
      this.schema,
      next as Record<string, unknown>,
      id,
    );
    return next;
  }

  async delete(id: string) {
    await this.client.deleteRecord(this.schema, id);
  }

  private idOf(record: DogfoodRecordMap[Name]) {
    const idField = idFields[this.schema];
    const id = (record as Record<string, unknown>)[idField];
    if (typeof id !== "string") throw new Error(`Missing id for ${this.schema}`);
    return id;
  }
}

export function createMemoryRepositories(): DogfoodRepositories {
  return {
    DogfoodFlow: new MemoryRecordRepository("DogfoodFlow"),
    GoalRevision: new MemoryRecordRepository("GoalRevision"),
    UxNode: new MemoryRecordRepository("UxNode"),
    UxEdge: new MemoryRecordRepository("UxEdge"),
    DogfoodSession: new MemoryRecordRepository("DogfoodSession"),
    Observation: new MemoryRecordRepository("Observation"),
    ScreenshotAsset: new MemoryRecordRepository("ScreenshotAsset"),
    ScreenshotAnnotation: new MemoryRecordRepository("ScreenshotAnnotation"),
    DiffItem: new MemoryRecordRepository("DiffItem"),
    DagChangeProposal: new MemoryRecordRepository("DagChangeProposal"),
  };
}
