import { describe, expect, it, vi } from "vitest";
import { dogfoodSchemaList } from "./dogfoodSchemas";
import {
  fixtureEdges,
  fixtureFlow,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
} from "./fixtures";
import { LastDbClient } from "./lastdbClient";
import {
  createMemoryRepositories,
  ImmutableRecordError,
  LastDbRecordRepository,
} from "./repository";

describe("Dogfood Graph data model", () => {
  it("declares every app-local schema through /api/apps/declare-schema", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          app_id: body.app_id,
          schema: body.schema.name,
          canonical: `dogfood-graph/${body.schema.name}`,
          resolution: "mint",
          decision: "mint",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = new LastDbClient({ baseUrl: "http://lastdb.local", fetchImpl });

    const declarations = await client.declareDogfoodSchemas();

    expect(fetchImpl).toHaveBeenCalledTimes(dogfoodSchemaList.length);
    expect(Object.keys(declarations)).toContain("DogfoodFlow");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://lastdb.local/api/apps/declare-schema",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-User-Hash": "dogfood-graph-local",
        }),
      }),
    );
  });

  it("stores one branched UX DAG and one dogfood session fixture", async () => {
    const repos = createMemoryRepositories();

    await repos.DogfoodFlow.create(fixtureFlow);
    await repos.GoalRevision.create(fixtureGoalRevision);
    await Promise.all(fixtureNodes.map((node) => repos.UxNode.create(node)));
    await Promise.all(fixtureEdges.map((edge) => repos.UxEdge.create(edge)));
    await repos.DogfoodSession.create(fixtureSession);
    await Promise.all(
      fixtureObservations.map((observation) =>
        repos.Observation.create(observation),
      ),
    );

    expect(await repos.DogfoodFlow.get(fixtureFlow.dogfoodFlow_id)).toEqual(
      fixtureFlow,
    );
    expect(await repos.UxNode.list()).toHaveLength(3);
    expect(await repos.UxEdge.list()).toHaveLength(3);
    expect(await repos.Observation.list()).toHaveLength(2);
  });

  it("keeps goal revisions immutable after creation", async () => {
    const repos = createMemoryRepositories();
    await repos.GoalRevision.create(fixtureGoalRevision);

    await expect(
      repos.GoalRevision.update(fixtureGoalRevision.goalRevision_id, {
        change_summary: "mutated",
      }),
    ).rejects.toBeInstanceOf(ImmutableRecordError);
  });

  it("rejects blank LastDB record ids before mutating", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const client = new LastDbClient({
      baseUrl: "http://lastdb.local",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const repo = new LastDbRecordRepository(
      "DogfoodFlow",
      ["dogfoodFlow_id", "title"],
      client,
    );

    await expect(
      repo.create({ ...fixtureFlow, dogfoodFlow_id: "" }),
    ).rejects.toThrow("DogfoodFlow record is missing dogfoodFlow_id");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("get() issues a HashKey point read, never a full-schema scan", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { results: [] } }), { status: 200 });
    });
    const client = new LastDbClient({
      baseUrl: "http://lastdb.local",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const repo = new LastDbRecordRepository(
      "DogfoodFlow",
      ["dogfoodFlow_id", "title"],
      client,
    );

    await repo.get("flow-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.filter).toEqual({ HashKey: "flow-1" });
  });

  it("list() drains explicit Page filters instead of an unfiltered query", async () => {
    const pages = [
      Array.from({ length: 2 }, (_, i) => ({ fields: { dogfoodFlow_id: `f${i}` } })),
      [] as { fields: { dogfoodFlow_id: string } }[],
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.filter).toHaveProperty("Page");
      const page = pages.shift() ?? [];
      return new Response(JSON.stringify({ data: { results: page } }), { status: 200 });
    });
    const client = new LastDbClient({
      baseUrl: "http://lastdb.local",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const repo = new LastDbRecordRepository(
      "DogfoodFlow",
      ["dogfoodFlow_id", "title"],
      client,
    );

    const rows = await repo.list();

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.filter).toEqual({ Page: { offset: 0, limit: 500 } });
  });
});
