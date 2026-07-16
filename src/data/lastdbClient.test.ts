import { describe, expect, it, vi } from "vitest";

import { LastDbClient } from "./lastdbClient";

describe("LastDbClient request headers", () => {
  it("labels fetch-based LastDB requests as dogfood-graph", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { results: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = new LastDbClient({
      baseUrl: "http://lastdb.test",
      userHash: "dogfood-graph-test",
      fetchImpl,
    });

    await client.query("DogfoodSession", ["dogfoodSession_id"]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://lastdb.test/api/query",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-LastDB-Client": "dogfood-graph",
          "X-User-Hash": "dogfood-graph-test",
        }),
      }),
    );
  });
});
