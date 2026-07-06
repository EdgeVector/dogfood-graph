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
});
