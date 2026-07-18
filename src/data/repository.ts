import { LastDbClient } from "./lastdbClient";
import type { DogfoodSchemaName } from "./dogfoodSchemas";
import type { DogfoodRecordMap } from "./types";

// Every dogfood-graph schema is Hash-keyed by its own id field (see
// `idFields` below), so a point read is always an exact `HashKey` filter —
// never a full-schema scan. Bounded page size for the explicit,
// non-scan list drain in `LastDbRecordRepository.list()`.
const LIST_PAGE_SIZE = 500;
// Safety ceiling so a runaway schema can't turn `list()` into an unbounded
// drain; mirrors the SDK's `queryAll` `maxRows` default order of magnitude
// scaled down for this app's expected record counts.
const LIST_MAX_ROWS = 20_000;

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

function idOf<Name extends DogfoodSchemaName>(
  schema: Name,
  record: DogfoodRecordMap[Name],
) {
  const idField = idFields[schema];
  const id = (record as Record<string, unknown>)[idField];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`${schema} record is missing ${String(idField)}`);
  }
  return id;
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
    return idOf(this.schema, record);
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
    const rows = await this.client.query<DogfoodRecordMap[Name]>(
      this.schema,
      this.fields,
      { HashKey: id },
    );
    return rows[0]?.fields;
  }

  // Bounded, explicitly-paginated drain — never an unfiltered `/api/query`.
  // Terminates on a short page (no pagination metadata required) or the
  // `LIST_MAX_ROWS` safety ceiling, whichever comes first.
  async list() {
    const records: DogfoodRecordMap[Name][] = [];
    let offset = 0;
    for (;;) {
      const rows = await this.client.query<DogfoodRecordMap[Name]>(
        this.schema,
        this.fields,
        { Page: { offset, limit: LIST_PAGE_SIZE } },
      );
      records.push(...rows.map((row) => row.fields));
      if (rows.length < LIST_PAGE_SIZE || records.length >= LIST_MAX_ROWS) break;
      offset += LIST_PAGE_SIZE;
    }
    return records;
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
    return idOf(this.schema, record);
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
