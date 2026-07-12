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
  "note",
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
  const nodeById = new Map(nodes.map((node) => [node.uxNode_id, node]));
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
    if (isRigRequiredNode(node)) continue;
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
    const rigRequiredRemainder = isRigRequiredRemainder(observation, expectedNode);
    const trimmedNotes = observation.notes?.trim();

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

    if (observation.verdict === "blocked" && (!rigRequiredRemainder || !trimmedNotes)) {
      diffs.push(diff(rigRequiredRemainder ? "note" : "blocked", session, revision, {
        expected_ref: observation.expected_node_id,
        observation_id: observation.observation_id,
        severity: rigRequiredRemainder ? "info" : "blocker",
        summary: rigRequiredRemainder
          ? `${observation.actual_title} is rig-required and was not exercisable in this run.`
          : `${observation.actual_title} blocked the dogfood run.`,
        suggested_next_action: rigRequiredRemainder ? "accept" : "file_product_bug",
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

    if (trimmedNotes) {
      diffs.push(diff("note", session, revision, {
        expected_ref: observation.expected_node_id,
        observation_id: observation.observation_id,
        severity: "info",
        summary: `${observation.actual_title}: ${trimmedNotes}`,
        suggested_next_action: rigRequiredRemainder ? "accept" : "file_product_bug",
        screenshot_ids: linkedScreenshots.map((screenshot) => screenshot.screenshotAsset_id),
      }));
    }
  }

  const requiredTerminalIds = revision.terminal_node_ids.filter((nodeId) => {
    const node = nodeById.get(nodeId);
    return !node || !isRigRequiredNode(node);
  });
  const reachedTerminal =
    requiredTerminalIds.length > 0
      ? requiredTerminalIds.some((nodeId) => observedNodeIds.has(nodeId))
      : requiredNodesSatisfied(nodes, observedNodeIds);
  diffs.push(
    diff(reachedTerminal ? "goal_satisfied" : "goal_not_satisfied", session, revision, {
      expected_ref: requiredTerminalIds[0] ?? revision.terminal_node_ids[0],
      severity: reachedTerminal ? "info" : "bug",
      summary: reachedTerminal
        ? "The session reached a valid terminal goal node."
        : "The session ended without evidence for a terminal goal node.",
      suggested_next_action: reachedTerminal ? "accept" : "rerun",
    }),
  );

  return diffs;
}

function isRigRequiredNode(node?: UxNode) {
  return node?.requires_rig === "true";
}

function isRigRequiredRemainder(observation: Observation, expectedNode?: UxNode) {
  if (isRigRequiredNode(expectedNode)) return true;
  const notes = observation.notes?.toLowerCase() ?? "";
  return /\brig[- ]required\b/.test(notes) || notes.includes("not exercisable single-node");
}

function requiredNodesSatisfied(nodes: UxNode[], observedNodeIds: Set<string>) {
  return nodes
    .filter((node) => !isRigRequiredNode(node))
    .every((node) => observedNodeIds.has(node.uxNode_id));
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
