import type {
  DiffItem,
  DogfoodSession,
  GoalRevision,
  Observation,
  ScreenshotAsset,
  UxEdge,
  UxNode,
} from "./types";

export const DIFF_CATEGORIES = [
  "missing_node",
  "unexpected_node",
  "state_delta",
  "action_delta",
  "result_delta",
  "branch_delta",
  "blocked",
  "evidence_gap",
  "goal_satisfied",
  "goal_not_satisfied",
] as const satisfies readonly DiffItem["category"][];

export function generateSessionDiffs(input: {
  session: DogfoodSession;
  revision: GoalRevision;
  nodes: UxNode[];
  edges: UxEdge[];
  observations: Observation[];
  screenshots: ScreenshotAsset[];
}): DiffItem[] {
  const { session, revision, nodes, edges, observations, screenshots } = input;
  const diffs: DiffItem[] = [];
  const observedNodeIds = new Set(
    observations
      .map((observation) => observation.expected_node_id)
      .filter((id): id is string => Boolean(id)),
  );
  const screenshotsByObservation = new Map<string, ScreenshotAsset[]>();
  for (const screenshot of screenshots) {
    screenshotsByObservation.set(screenshot.observation_id, [
      ...(screenshotsByObservation.get(screenshot.observation_id) ?? []),
      screenshot,
    ]);
  }

  for (const node of nodes) {
    if (!observedNodeIds.has(node.uxNode_id)) {
      diffs.push(diff("missing_node", session, revision, {
        expected_ref: node.uxNode_id,
        severity: node.node_type === "terminal" ? "bug" : "papercut",
        summary: `${node.title} was expected but not observed.`,
        suggested_next_action: "rerun",
      }));
    }
  }

  for (const observation of observations) {
    const linkedScreenshots = screenshotsByObservation.get(observation.observation_id) ?? [];
    const expectedNode = nodes.find(
      (node) => node.uxNode_id === observation.expected_node_id,
    );
    const selectedEdge = edges.find(
      (edge) => edge.uxEdge_id === observation.selected_edge_id,
    );

    if (!observation.expected_node_id || observation.verdict === "unexpected") {
      diffs.push(diff("unexpected_node", session, revision, {
        observation_id: observation.observation_id,
        severity: "bug",
        summary: `${observation.actual_title} does not map to an expected node.`,
        suggested_next_action: "update_goal",
        screenshot_ids: linkedScreenshots.map((screenshot) => screenshot.screenshotAsset_id),
      }));
    }

    if (observation.verdict === "minor_delta" || observation.verdict === "major_delta") {
      diffs.push(diff("state_delta", session, revision, {
        expected_ref: observation.expected_node_id,
        observation_id: observation.observation_id,
        severity: observation.verdict === "major_delta" ? "bug" : "papercut",
        summary: `${observation.actual_title} differed from the expected state.`,
        suggested_next_action: "file_product_bug",
        screenshot_ids: linkedScreenshots.map((screenshot) => screenshot.screenshotAsset_id),
      }));
    }

    if (observation.verdict === "blocked") {
      diffs.push(diff("blocked", session, revision, {
        expected_ref: observation.expected_node_id,
        observation_id: observation.observation_id,
        severity: "blocker",
        summary: `${observation.actual_title} blocked the dogfood run.`,
        suggested_next_action: "file_product_bug",
        screenshot_ids: linkedScreenshots.map((screenshot) => screenshot.screenshotAsset_id),
      }));
    }

    if (expectedNode && selectedEdge && selectedEdge.from_node_id !== expectedNode.uxNode_id) {
      diffs.push(diff("branch_delta", session, revision, {
        expected_ref: selectedEdge.uxEdge_id,
        observation_id: observation.observation_id,
        severity: "papercut",
        summary: `${selectedEdge.label} is not an available branch from ${expectedNode.title}.`,
        suggested_next_action: "update_goal",
        screenshot_ids: linkedScreenshots.map((screenshot) => screenshot.screenshotAsset_id),
      }));
    }

    if (linkedScreenshots.length === 0) {
      diffs.push(diff("evidence_gap", session, revision, {
        expected_ref: observation.expected_node_id,
        observation_id: observation.observation_id,
        severity: "info",
        summary: `${observation.actual_title} has notes but no screenshot evidence.`,
        suggested_next_action: "rerun",
      }));
    }
  }

  const reachedTerminal = revision.terminal_node_ids.some((nodeId) =>
    observedNodeIds.has(nodeId),
  );
  diffs.push(
    diff(reachedTerminal ? "goal_satisfied" : "goal_not_satisfied", session, revision, {
      expected_ref: revision.terminal_node_ids[0],
      severity: reachedTerminal ? "info" : "bug",
      summary: reachedTerminal
        ? "The session reached a valid terminal goal node."
        : "The session ended without evidence for a terminal goal node.",
      suggested_next_action: reachedTerminal ? "accept" : "rerun",
    }),
  );

  return diffs;
}

function diff(
  category: DiffItem["category"],
  session: DogfoodSession,
  revision: GoalRevision,
  overrides: Partial<DiffItem> & Pick<DiffItem, "summary" | "suggested_next_action">,
): DiffItem {
  return {
    diffItem_id: `diff-${category}-${overrides.observation_id ?? overrides.expected_ref ?? "goal"}`,
    session_id: session.dogfoodSession_id,
    goal_revision_id: revision.goalRevision_id,
    category,
    expected_ref: overrides.expected_ref,
    observation_id: overrides.observation_id,
    severity: overrides.severity ?? "info",
    summary: overrides.summary,
    suggested_next_action: overrides.suggested_next_action,
    screenshot_ids: overrides.screenshot_ids ?? [],
  };
}
