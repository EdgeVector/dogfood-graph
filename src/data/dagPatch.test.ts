import { describe, expect, it } from "vitest";
import {
  applyPreviewAsRevision,
  compileIntentToOperations,
  previewDagPatch,
} from "./dagPatch";
import { fixtureEdges, fixtureGoalRevision, fixtureNodes } from "./fixtures";

describe("DAG patch proposals", () => {
  it("compiles intent into previewable operations", () => {
    const operations = compileIntentToOperations({
      intent: "Add a recovery phrase confirmation screen",
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
    });
    const preview = previewDagPatch({
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
      edges: fixtureEdges,
      operations,
    });

    expect(operations.map((operation) => operation.type)).toEqual([
      "set_goal_state",
      "add_node",
      "add_edge",
    ]);
    expect(preview.nodes).toHaveLength(fixtureNodes.length + 1);
    expect(preview.edges).toHaveLength(fixtureEdges.length + 1);
  });

  it("applies preview as a new immutable revision", () => {
    const preview = previewDagPatch({
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
      edges: fixtureEdges,
      operations: [],
    });
    const applied = applyPreviewAsRevision(preview, "goal-setup-v2");

    expect(applied.revision.goalRevision_id).toBe("goal-setup-v2");
    expect(applied.revision.base_revision_id).toBe(fixtureGoalRevision.goalRevision_id);
    expect(
      applied.nodes.every((node) => node.goal_revision_id === "goal-setup-v2"),
    ).toBe(true);
  });
});
