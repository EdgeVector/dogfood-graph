#!/usr/bin/env -S node --experimental-strip-types
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { dogfoodSchemas, type DogfoodSchemaName } from "../data/dogfoodSchemas.ts";
import {
  fixtureEdges,
  fixtureFlow,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
} from "../data/fixtures.ts";
import { LastDbNodeClient, type LastDbSchemaMap } from "../data/lastdbNodeClient.ts";
import type { DogfoodRecordMap } from "../data/types.ts";

const CONFIG_PATH =
  process.env.DOGFOOD_GRAPH_LASTDB_CONFIG ??
  join(process.cwd(), ".dogfood-graph", "lastdb-schemas.json");

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

function usage(): never {
  console.error(`Usage:
  npm run lastdb -- health
  npm run lastdb -- declare
  npm run lastdb -- seed
  npm run lastdb -- list <SchemaName>
  npm run lastdb -- export
  npm run lastdb -- put <SchemaName> <record-json> [create|update]
  npm run lastdb -- delete <SchemaName> <id>

Config: ${CONFIG_PATH}
Socket: DOGFOOD_GRAPH_LASTDB_SOCKET, FOLDDB_SOCKET_PATH, FBRAIN_FOLDDB_SOCKET, or ~/.folddb/data/folddb.sock`);
  process.exit(2);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const client = new LastDbNodeClient();

  if (!command || command === "help" || command === "--help") usage();

  if (command === "health") {
    const identity = await client.autoIdentity();
    console.log(
      JSON.stringify({ ok: true, transport: client.transport, identity }, null, 2),
    );
    return;
  }

  if (command === "declare") {
    const schemas = await client.declareDogfoodSchemas();
    await writeConfig(schemas);
    console.log(JSON.stringify({ ok: true, schemas, config: CONFIG_PATH }, null, 2));
    return;
  }

  if (command === "seed") {
    const schemas = await ensureSchemas(client);
    const counts = await seedFixtures(client, schemas);
    console.log(JSON.stringify({ ok: true, counts, config: CONFIG_PATH }, null, 2));
    return;
  }

  if (command === "list") {
    const schema = parseSchemaName(args[0]);
    const schemas = await ensureSchemas(client);
    const rows = await client.queryAll(schemas[schema], schemaFields(schema));
    console.log(JSON.stringify(rows.map((row) => row.fields), null, 2));
    return;
  }

  if (command === "export") {
    const schemas = await ensureSchemas(client);
    const entries = await Promise.all(
      schemaNames().map(async (schema) => [
        schema,
        (await client.queryAll(schemas[schema], schemaFields(schema))).map((row) => row.fields),
      ]),
    );
    console.log(JSON.stringify(Object.fromEntries(entries), null, 2));
    return;
  }

  if (command === "put") {
    const schema = parseSchemaName(args[0]);
    const record = parseRecord(args[1]);
    const mutation = args[2] === "update" ? "update" : "create";
    const schemas = await ensureSchemas(client);
    await client.putRecord(schemas[schema], record, idOf(schema, record), mutation);
    console.log(JSON.stringify({ ok: true, schema, id: idOf(schema, record), mutation }));
    return;
  }

  if (command === "delete") {
    const schema = parseSchemaName(args[0]);
    const id = args[1];
    if (!id) usage();
    const schemas = await ensureSchemas(client);
    await client.deleteRecord(schemas[schema], id);
    console.log(JSON.stringify({ ok: true, schema, id }));
    return;
  }

  usage();
}

async function ensureSchemas(client: LastDbNodeClient): Promise<LastDbSchemaMap> {
  const existing = await readConfig();
  if (existing) return existing;
  const schemas = await client.declareDogfoodSchemas();
  await writeConfig(schemas);
  return schemas;
}

async function readConfig(): Promise<LastDbSchemaMap | null> {
  if (!existsSync(CONFIG_PATH)) return null;
  return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as LastDbSchemaMap;
}

async function writeConfig(schemas: LastDbSchemaMap) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(schemas, null, 2)}\n`);
}

async function seedFixtures(client: LastDbNodeClient, schemas: LastDbSchemaMap) {
  const records: { [Name in DogfoodSchemaName]?: DogfoodRecordMap[Name][] } = {
    DogfoodFlow: [fixtureFlow],
    GoalRevision: [fixtureGoalRevision],
    UxNode: fixtureNodes,
    UxEdge: fixtureEdges,
    DogfoodSession: [
      {
        ...fixtureSession,
        status: "in_progress",
        ended_at: undefined,
      },
    ],
    Observation: fixtureObservations,
  };
  const counts: Partial<Record<DogfoodSchemaName, number>> = {};
  for (const schema of schemaNames()) {
    const schemaRecords = records[schema] ?? [];
    for (const record of schemaRecords) {
      await client.putRecord(
        schemas[schema],
        record as Record<string, unknown>,
        idOf(schema, record as Record<string, unknown>),
        "create",
      );
    }
    if (schemaRecords.length > 0) counts[schema] = schemaRecords.length;
  }
  return counts;
}

function schemaNames() {
  return Object.keys(dogfoodSchemas) as DogfoodSchemaName[];
}

function parseSchemaName(value?: string): DogfoodSchemaName {
  if (!value || !(value in dogfoodSchemas)) usage();
  return value as DogfoodSchemaName;
}

function schemaFields(schema: DogfoodSchemaName) {
  return [...dogfoodSchemas[schema].fields];
}

function parseRecord(value?: string) {
  if (!value) usage();
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("record-json must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function idOf(schema: DogfoodSchemaName, record: Record<string, unknown>) {
  const id = record[idFields[schema]];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`${schema} record is missing ${idFields[schema]}`);
  }
  return id;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
