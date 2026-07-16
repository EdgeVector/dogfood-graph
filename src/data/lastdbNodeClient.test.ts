import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { dogfoodSchemas } from "./dogfoodSchemas";
import {
  LastDbNodeClient,
  applyFieldMapper,
  inferFieldMapper,
  reverseFieldMapper,
} from "./lastdbNodeClient";

describe("field mappers", () => {
  const mapper = {
    goal_revision_id: "current_goal_revision_id",
    screenshot_ids: "screenshot_id",
  };

  it("renames mapped fields on write and leaves others alone", () => {
    expect(
      applyFieldMapper(
        { uxNode_id: "n1", goal_revision_id: "g1", title: "t" },
        mapper,
      ),
    ).toEqual({ uxNode_id: "n1", current_goal_revision_id: "g1", title: "t" });
  });

  it("restores app-local names on read", () => {
    expect(
      reverseFieldMapper(
        { uxNode_id: "n1", current_goal_revision_id: "g1", screenshot_id: ["s1"] },
        mapper,
      ),
    ).toEqual({ uxNode_id: "n1", goal_revision_id: "g1", screenshot_ids: ["s1"] });
  });

  it("round-trips a record through apply then reverse", () => {
    const record = { diffItem_id: "d1", goal_revision_id: "g1", screenshot_ids: [] };
    expect(reverseFieldMapper(applyFieldMapper(record, mapper), mapper)).toEqual(record);
  });

  it("is a no-op without a mapper", () => {
    const record = { observation_id: "o1" };
    expect(applyFieldMapper(record, undefined)).toBe(record);
    expect(reverseFieldMapper(record, {})).toBe(record);
  });

  it("infers goal revision and screenshot aliases from runtime schema fields", () => {
    expect(
      inferFieldMapper(dogfoodSchemas.DogfoodSession.fields, [
        "dogfoodSession_id",
        "flow_id",
        "current_goal_revision_id",
        "started_at",
      ]),
    ).toEqual({ goal_revision_id: "current_goal_revision_id" });

    expect(
      inferFieldMapper(dogfoodSchemas.DiffItem.fields, [
        "diffItem_id",
        "session_id",
        "current_goal_revision_id",
        "screenshot_id",
      ]),
    ).toEqual({
      goal_revision_id: "current_goal_revision_id",
      screenshot_ids: "screenshot_id",
    });
  });

  it("queries physical fields and returns logical session fields", async () => {
    // Mock the SDK data-plane transport: queryAll now drives the vendored
    // `@lastdb/app-sdk` LastDbClient, whose only injection seam is the
    // Transport. We assert the mapped request body and reverse-mapped rows the
    // same way, but at the SDK boundary instead of the retired hand-rolled
    // `rawRequest`.
    const requests: unknown[] = [];
    const transport = {
      target: "unix:mock",
      async send(_method: string, _path: string, options?: { body?: unknown }) {
        requests.push(options?.body);
        return {
          status: 200,
          body: {
            results: [
              {
                key: { hash: "session-1", range: null },
                fields: {
                  dogfoodSession_id: "session-1",
                  flow_id: "flow-1",
                  current_goal_revision_id: "goal-1",
                  started_at: "2026-07-09T00:00:00Z",
                },
              },
            ],
          },
        };
      },
    };
    const client = new LastDbNodeClient({ userHash: "dogfood-graph-test", transport });

    const rows = await client.queryAll(
      "dogfood-graph/DogfoodSession",
      dogfoodSchemas.DogfoodSession.fields,
      { goal_revision_id: "current_goal_revision_id" },
    );

    expect(requests).toEqual([
      expect.objectContaining({
        fields: expect.arrayContaining(["current_goal_revision_id"]),
      }),
    ]);
    expect(requests).toEqual([
      expect.objectContaining({
        fields: expect.not.arrayContaining(["goal_revision_id"]),
      }),
    ]);
    expect(rows[0]?.fields).toMatchObject({
      dogfoodSession_id: "session-1",
      goal_revision_id: "goal-1",
    });
  });
});

describe("LastDbNodeClient request headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("labels owner-only node requests as dogfood-graph", async () => {
    let headers: http.OutgoingHttpHeaders | undefined;

    const requestMock = vi.spyOn(http, "request") as unknown as {
      mockImplementation: (fn: (...args: unknown[]) => http.ClientRequest) => void;
    };
    requestMock.mockImplementation((...args: unknown[]) => {
      const options = args[0] as http.RequestOptions;
      const callback = args.find(
        (arg): arg is (res: http.IncomingMessage) => void => typeof arg === "function",
      );
      headers = options.headers as http.OutgoingHttpHeaders | undefined;
      const response = {
        statusCode: 200,
        on(event: string, handler: (chunk?: Buffer) => void) {
          if (event === "data") {
            queueMicrotask(() =>
              handler(Buffer.from(JSON.stringify({ user_hash: "dogfood-graph-test" }))),
            );
          }
          if (event === "end") queueMicrotask(() => handler());
          return response;
        },
      };
      queueMicrotask(() => callback?.(response as unknown as http.IncomingMessage));
      return {
        on: vi.fn().mockReturnThis(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      } as unknown as http.ClientRequest;
    });

    const client = new LastDbNodeClient({
      socketPath: "/tmp/dogfood-graph-test.sock",
      userHash: "dogfood-graph-test",
    });

    await client.autoIdentity();

    expect(headers).toMatchObject({
      "X-LastDB-Client": "dogfood-graph",
      "X-User-Hash": "dogfood-graph-test",
    });
  });
});
