import { describe, expect, it } from "vitest";
import {
  fixtureEdges,
  fixtureGoalRevision,
  fixtureNodes,
} from "./fixtures";
import { validateGoalDag } from "./graphValidation";

describe("validateGoalDag", () => {
  it("accepts the fixture DAG", () => {
    expect(
      validateGoalDag(fixtureGoalRevision, fixtureNodes, fixtureEdges),
    ).toEqual([]);
  });

  it("catches unreachable nodes, unlabeled branches, missing exits, and cycles", () => {
    const issues = validateGoalDag(
      fixtureGoalRevision,
      [
        ...fixtureNodes,
        {
          uxNode_id: "node-orphan",
          goal_revision_id: fixtureGoalRevision.goalRevision_id,
          node_type: "screen",
          title: "Orphan",
          expected_state: "Cannot be reached",
          acceptance_checks: [],
          failure_modes: [],
        },
      ],
      [
        ...fixtureEdges,
        {
          uxEdge_id: "edge-empty",
          goal_revision_id: fixtureGoalRevision.goalRevision_id,
          from_node_id: "node-dashboard-ready",
          to_node_id: "node-start",
          trigger_type: "user_action",
          label: "",
          priority: "3",
        },
      ],
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "unreachable_node",
        "unlabeled_branch",
        "missing_exit",
        "unmarked_cycle",
      ]),
    );
  });
});
