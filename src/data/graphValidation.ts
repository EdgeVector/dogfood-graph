import type { GoalRevision, UxEdge, UxNode } from "./types";

export type GraphValidationIssue = {
  code:
    | "unreachable_node"
    | "unlabeled_branch"
    | "missing_exit"
    | "unmarked_cycle"
    | "missing_terminal";
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export function validateGoalDag(
  revision: GoalRevision,
  nodes: UxNode[],
  edges: UxEdge[],
): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeById = new Map(nodes.map((node) => [node.uxNode_id, node]));
  const outgoing = new Map<string, UxEdge[]>();

  for (const edge of edges) {
    if (!edge.label.trim()) {
      issues.push({
        code: "unlabeled_branch",
        severity: "error",
        message: `Edge from ${edge.from_node_id} needs a branch label.`,
        edgeId: edge.uxEdge_id,
      });
    }
    outgoing.set(edge.from_node_id, [
      ...(outgoing.get(edge.from_node_id) ?? []),
      edge,
    ]);
  }

  for (const node of nodes) {
    const exits = outgoing.get(node.uxNode_id) ?? [];
    if (node.node_type !== "terminal" && exits.length === 0) {
      issues.push({
        code: "missing_exit",
        severity: "error",
        message: `${node.title} needs at least one outgoing branch.`,
        nodeId: node.uxNode_id,
      });
    }
  }

  const reachable = new Set<string>();
  const stack = [...revision.entry_node_ids];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of outgoing.get(id) ?? []) stack.push(edge.to_node_id);
  }

  for (const node of nodes) {
    if (!reachable.has(node.uxNode_id)) {
      issues.push({
        code: "unreachable_node",
        severity: "error",
        message: `${node.title} is not reachable from an entry node.`,
        nodeId: node.uxNode_id,
      });
    }
  }

  const terminalReached = revision.terminal_node_ids.some((id) =>
    reachable.has(id),
  );
  if (!terminalReached) {
    issues.push({
      code: "missing_terminal",
      severity: "error",
      message: "No terminal goal node is reachable from the entry path.",
    });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string, path: string[]) {
    const node = nodeById.get(nodeId);
    if (!node) return;
    if (visiting.has(nodeId)) {
      const cyclePath = [...path, nodeId]
        .map((id) => nodeById.get(id)?.title ?? id)
        .join(" -> ");
      const loopAllowed = [...visiting, nodeId].some(
        (id) => nodeById.get(id)?.loop_allowed === "true",
      );
      if (!loopAllowed) {
        issues.push({
          code: "unmarked_cycle",
          severity: "error",
          message: `Cycle must be marked loop-allowed: ${cyclePath}.`,
          nodeId,
        });
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      visit(edge.to_node_id, [...path, nodeId]);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const entryId of revision.entry_node_ids) visit(entryId, []);

  return issues;
}
