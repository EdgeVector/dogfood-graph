import { describe, expect, it } from "vitest";
import { generateSessionDiffs } from "./diffEngine";
import {
  fixtureEdges,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
} from "./fixtures";

describe("generateSessionDiffs", () => {
  it("generates missing, evidence, and goal diffs for a partial session", () => {
    const diffs = generateSessionDiffs({
      session: fixtureSession,
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
      edges: fixtureEdges,
      observations: fixtureObservations,
      screenshots: [],
    });

    expect(diffs.map((diff) => diff.category)).toEqual(
      expect.arrayContaining([
        "missing_node",
        "evidence_gap",
        "goal_not_satisfied",
      ]),
    );
  });

  it("links unexpected observations to screenshots", () => {
    const diffs = generateSessionDiffs({
      session: fixtureSession,
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
      edges: fixtureEdges,
      observations: [
        {
          observation_id: "observation-surprise",
          session_id: fixtureSession.dogfoodSession_id,
          actual_title: "Surprise modal",
          actual_state: "A modal appeared outside the expected path.",
          verdict: "unexpected",
          captured_at: "2026-07-04T01:03:00.000Z",
        },
      ],
      screenshots: [
        {
          screenshotAsset_id: "screenshot-surprise",
          observation_id: "observation-surprise",
          asset_ref: "local://surprise",
          mime_type: "image/png",
          width: "100",
          height: "100",
          byte_size: "123",
          captured_at: "2026-07-04T01:03:01.000Z",
          redaction_state: "raw",
        },
      ],
    });

    expect(
      diffs.find((diff) => diff.category === "unexpected_node")?.screenshot_ids,
    ).toEqual(["screenshot-surprise"]);
  });

  it("surfaces observation notes as an info diff even when the verdict matches", () => {
    const note = "blog index shows full-paragraph abstracts for 17 posts — heavy to scan";
    const diffs = generateSessionDiffs({
      session: fixtureSession,
      revision: fixtureGoalRevision,
      nodes: fixtureNodes,
      edges: fixtureEdges,
      observations: [
        {
          observation_id: "observation-start",
          session_id: fixtureSession.dogfoodSession_id,
          expected_node_id: "node-start",
          actual_title: "Installer opened",
          actual_state: "Setup entry point was visible.",
          selected_edge_id: "edge-start-choice",
          verdict: "matches",
          captured_at: "2026-07-04T01:01:00.000Z",
        },
        {
          observation_id: "observation-blog-index",
          session_id: fixtureSession.dogfoodSession_id,
          expected_node_id: "node-dashboard-ready",
          actual_title: "Blog index",
          actual_state: "The blog index rendered as expected.",
          verdict: "matches",
          notes: note,
          captured_at: "2026-07-04T01:02:00.000Z",
        },
      ],
      screenshots: [],
    });

    const noteDiffs = diffs.filter((diff) => diff.category === "note");
    expect(noteDiffs).toHaveLength(1);
    const noteDiff = noteDiffs[0];
    expect(noteDiff.severity).toBe("info");
    expect(noteDiff.observation_id).toBe("observation-blog-index");
    expect(noteDiff.summary).toContain(note);

    // goal_satisfied logic is unchanged: the terminal node was reached.
    expect(diffs.map((diff) => diff.category)).toContain("goal_satisfied");
  });

  it("treats a blocked rig-required terminal node as an accepted informational remainder", () => {
    const rigNode = {
      uxNode_id: "node-lower-trust-hidden",
      goal_revision_id: fixtureGoalRevision.goalRevision_id,
      node_type: "terminal" as const,
      title: "Lower-trust hidden-field check",
      expected_state: "A lower-trust identity cannot read the hidden field.",
      acceptance_checks: ["Second identity read omits the hidden field"],
      failure_modes: [],
      requires_rig: "true" as const,
    };
    const diffs = generateSessionDiffs({
      session: fixtureSession,
      revision: {
        ...fixtureGoalRevision,
        terminal_node_ids: ["node-dashboard-ready", rigNode.uxNode_id],
      },
      nodes: [...fixtureNodes, rigNode],
      edges: fixtureEdges,
      observations: [
        ...fixtureObservations,
        {
          observation_id: "observation-dashboard-ready",
          session_id: fixtureSession.dogfoodSession_id,
          expected_node_id: "node-dashboard-ready",
          actual_title: "Dashboard ready",
          actual_state: "Feasible single-node half passed.",
          verdict: "matches",
          captured_at: "2026-07-04T01:03:00.000Z",
        },
        {
          observation_id: "observation-lower-trust-hidden",
          session_id: fixtureSession.dogfoodSession_id,
          expected_node_id: rigNode.uxNode_id,
          actual_title: "Lower-trust hidden-field check",
          actual_state: "Needs a second identity peer.",
          verdict: "blocked",
          notes: "Rig-required remainder: not exercisable single-node.",
          captured_at: "2026-07-04T01:04:00.000Z",
        },
      ],
      screenshots: [],
    });

    expect(
      diffs.some(
        (diff) =>
          diff.observation_id === "observation-lower-trust-hidden" &&
          (diff.severity === "blocker" ||
            diff.suggested_next_action === "file_product_bug"),
      ),
    ).toBe(false);
    expect(
      diffs.find(
        (diff) =>
          diff.observation_id === "observation-lower-trust-hidden" &&
          diff.category === "note",
      )?.suggested_next_action,
    ).toBe("accept");
    expect(diffs.map((diff) => diff.category)).toContain("goal_satisfied");
  });

  it("does not fail a run when only rig-required terminal nodes remain unreached", () => {
    const startNode = {
      uxNode_id: "node-policy-readback",
      goal_revision_id: "goal-rig-only-v1",
      node_type: "system_state" as const,
      title: "Policy readback",
      expected_state: "The feasible single-node policy check passed.",
      acceptance_checks: ["Policy reads back as Inner"],
      failure_modes: [],
    };
    const rigNode = {
      uxNode_id: "node-lower-trust-hidden",
      goal_revision_id: "goal-rig-only-v1",
      node_type: "terminal" as const,
      title: "Lower-trust hidden-field check",
      expected_state: "A lower-trust identity cannot read the hidden field.",
      acceptance_checks: ["Second identity read omits the hidden field"],
      failure_modes: [],
      requires_rig: "true" as const,
    };

    const diffs = generateSessionDiffs({
      session: { ...fixtureSession, goal_revision_id: "goal-rig-only-v1" },
      revision: {
        ...fixtureGoalRevision,
        goalRevision_id: "goal-rig-only-v1",
        entry_node_ids: [startNode.uxNode_id],
        terminal_node_ids: [rigNode.uxNode_id],
      },
      nodes: [startNode, rigNode],
      edges: [],
      observations: [
        {
          observation_id: "observation-policy-readback",
          session_id: fixtureSession.dogfoodSession_id,
          expected_node_id: startNode.uxNode_id,
          actual_title: "Policy readback",
          actual_state: "The feasible single-node policy check passed.",
          verdict: "matches",
          captured_at: "2026-07-04T01:03:00.000Z",
        },
      ],
      screenshots: [],
    });

    expect(
      diffs.find((diff) => diff.expected_ref === rigNode.uxNode_id)?.category,
    ).toBe("goal_satisfied");
    expect(diffs.map((diff) => diff.category)).not.toContain("missing_node");
    expect(diffs.map((diff) => diff.category)).not.toContain("goal_not_satisfied");
  });
});
