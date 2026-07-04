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
import { createMemoryRepositories, ImmutableRecordError } from "./repository";

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
});
