import { describe, expect, it } from "vitest";

import { applyFieldMapper, reverseFieldMapper } from "./lastdbNodeClient";

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
});
