#!/usr/bin/env -S node --experimental-strip-types
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { dogfoodSchemas, type DogfoodSchemaName } from "../data/dogfoodSchemas.ts";
import { generateSessionDiffs } from "../data/diffEngine.ts";
import {
  fixtureEdges,
  fixtureFlow,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
} from "../data/fixtures.ts";
import {
  LastDbNodeClient,
  type LastDbFieldMapperMap,
  type LastDbSchemaMap,
} from "../data/lastdbNodeClient.ts";
import type { DogfoodRecordMap } from "../data/types.ts";

const CONFIG_PATH =
  process.env.DOGFOOD_GRAPH_LASTDB_CONFIG ??
  join(process.cwd(), ".dogfood-graph", "lastdb-schemas.json");

// Optional per-schema field renames (see LastDbFieldMapper). Present when the
// node's schemas were materialized through the schema service, which unifies
// same-purpose fields onto existing canonical names; absent on nodes that
// materialize app-declared schemas verbatim.
const MAPPERS_PATH =
  process.env.DOGFOOD_GRAPH_LASTDB_MAPPERS ??
  join(process.cwd(), ".dogfood-graph", "lastdb-field-mappers.json");

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
  npm run lastdb -- import <records.json> [create|update]
  npm run lastdb -- diff <DogfoodSession-id>
  npm run lastdb -- delete <SchemaName> <id>

import reads {"<SchemaName>": [record, ...], ...} and puts every record —
stage one JSON file instead of shell-quoting per-record put calls.
diff loads a stored session (revision, nodes, edges, observations,
screenshots), runs the diff engine, and persists the resulting DiffItems.

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
    const mappers = await readMappers();
    const counts = await seedFixtures(client, schemas, mappers);
    console.log(JSON.stringify({ ok: true, counts, config: CONFIG_PATH }, null, 2));
    return;
  }

  if (command === "list") {
    const schema = parseSchemaName(args[0]);
    const schemas = await ensureSchemas(client);
    const mappers = await readMappers();
    const rows = await client.queryAll(schemas[schema], schemaFields(schema), mappers[schema]);
    console.log(JSON.stringify(rows.map((row) => row.fields), null, 2));
    return;
  }

  if (command === "export") {
    const schemas = await ensureSchemas(client);
    const mappers = await readMappers();
    const entries = await Promise.all(
      schemaNames().map(async (schema) => [
        schema,
        (
          await client.queryAll(schemas[schema], schemaFields(schema), mappers[schema])
        ).map((row) => row.fields),
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
    const mappers = await readMappers();
    await client.putRecord(
      schemas[schema],
      record,
      idOf(schema, record),
      mutation,
      mappers[schema],
    );
    console.log(JSON.stringify({ ok: true, schema, id: idOf(schema, record), mutation }));
    return;
  }

  if (command === "import") {
    const path = args[0];
    if (!path) usage();
    const mutation = args[1] === "update" ? "update" : "create";
    const records = JSON.parse(await readFile(path, "utf8")) as Partial<
      Record<DogfoodSchemaName, Record<string, unknown>[]>
    >;
    const unknown = Object.keys(records).filter((name) => !(name in dogfoodSchemas));
    if (unknown.length > 0) {
      throw new Error(`unknown schema name(s) in ${path}: ${unknown.join(", ")}`);
    }
    const schemas = await ensureSchemas(client);
    const mappers = await readMappers();
    const counts: Partial<Record<DogfoodSchemaName, number>> = {};
    for (const schema of schemaNames()) {
      const rows = records[schema] ?? [];
      for (const record of rows) {
        await client.putRecord(
          schemas[schema],
          record,
          idOf(schema, record),
          mutation,
          mappers[schema],
        );
      }
      if (rows.length > 0) counts[schema] = rows.length;
    }
    console.log(JSON.stringify({ ok: true, mutation, counts }, null, 2));
    return;
  }

  if (command === "diff") {
    const sessionId = args[0];
    if (!sessionId) usage();
    const schemas = await ensureSchemas(client);
    const mappers = await readMappers();
    const fetch = async <Name extends DogfoodSchemaName>(schema: Name) =>
      (await client.queryAll(schemas[schema], schemaFields(schema), mappers[schema])).map(
        (row) => row.fields,
      ) as DogfoodRecordMap[Name][];

    const session = (await fetch("DogfoodSession")).find(
      (row) => row.dogfoodSession_id === sessionId,
    );
    if (!session) throw new Error(`DogfoodSession '${sessionId}' not found`);
    const revision = (await fetch("GoalRevision")).find(
      (row) => row.goalRevision_id === session.goal_revision_id,
    );
    if (!revision) {
      throw new Error(
        `GoalRevision '${session.goal_revision_id}' for session '${sessionId}' not found`,
      );
    }
    const nodes = (await fetch("UxNode")).filter(
      (row) => row.goal_revision_id === revision.goalRevision_id,
    );
    const edges = (await fetch("UxEdge")).filter(
      (row) => row.goal_revision_id === revision.goalRevision_id,
    );
    const observations = (await fetch("Observation")).filter(
      (row) => row.session_id === sessionId,
    );
    const observationIds = new Set(observations.map((row) => row.observation_id));
    const screenshots = (await fetch("ScreenshotAsset")).filter((row) =>
      observationIds.has(row.observation_id),
    );

    const diffs = generateSessionDiffs({
      session,
      revision,
      nodes,
      edges,
      observations,
      screenshots,
    });
    for (const item of diffs) {
      await client.putRecord(
        schemas.DiffItem,
        item as unknown as Record<string, unknown>,
        item.diffItem_id,
        "create",
        mappers.DiffItem,
      );
    }
    console.log(JSON.stringify({ ok: true, session: sessionId, diffs }, null, 2));
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

async function readMappers(): Promise<LastDbFieldMapperMap> {
  if (!existsSync(MAPPERS_PATH)) return {};
  return JSON.parse(await readFile(MAPPERS_PATH, "utf8")) as LastDbFieldMapperMap;
}

async function writeConfig(schemas: LastDbSchemaMap) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(schemas, null, 2)}\n`);
}

async function seedFixtures(
  client: LastDbNodeClient,
  schemas: LastDbSchemaMap,
  mappers: LastDbFieldMapperMap,
) {
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
        mappers[schema],
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
