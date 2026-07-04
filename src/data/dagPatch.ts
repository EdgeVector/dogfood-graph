import type { GoalRevision, UxEdge, UxNode } from "./types";

export type DagOperation =
  | { type: "add_node"; node: UxNode }
  | { type: "update_node"; node_id: string; patch: Partial<UxNode> }
  | { type: "remove_node"; node_id: string }
  | { type: "add_edge"; edge: UxEdge }
  | { type: "update_edge"; edge_id: string; patch: Partial<UxEdge> }
  | { type: "remove_edge"; edge_id: string }
  | { type: "split_node"; node_id: string; new_node: UxNode; edge: UxEdge }
  | { type: "merge_nodes"; source_node_id: string; target_node_id: string }
  | { type: "mark_terminal"; node_id: string }
  | { type: "set_goal_state"; goal_state: string };

export type DagPatchPreview = {
  revision: GoalRevision;
  nodes: UxNode[];
  edges: UxEdge[];
  operations: DagOperation[];
};

export function compileIntentToOperations(input: {
  intent: string;
  revision: GoalRevision;
  nodes: UxNode[];
}): DagOperation[] {
  const normalized = input.intent.trim();
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const nextNodeId = `node-proposal-${slug || "draft"}`;
  const entryNode = input.nodes[0];

  const operations: DagOperation[] = [
    { type: "set_goal_state", goal_state: normalized || input.revision.goal_state },
  ];

  if (normalized.length > 0 && entryNode) {
    operations.push({
      type: "add_node",
      node: {
        uxNode_id: nextNodeId,
        goal_revision_id: input.revision.goalRevision_id,
        node_type: "terminal",
        title: normalized.length > 56 ? `${normalized.slice(0, 53)}...` : normalized,
        expected_state: normalized,
        expected_action: "",
        expected_result: "",
        acceptance_checks: ["Review proposed expectation"],
        failure_modes: [],
      },
    });
    operations.push({
      type: "add_edge",
      edge: {
        uxEdge_id: `edge-proposal-${slug || "draft"}`,
        goal_revision_id: input.revision.goalRevision_id,
        from_node_id: entryNode.uxNode_id,
        to_node_id: nextNodeId,
        trigger_type: "user_action",
        label: "Proposed path",
        condition: "",
        expected_latency: "",
        priority: "99",
      },
    });
  }

  return operations;
}

export function previewDagPatch(input: {
  revision: GoalRevision;
  nodes: UxNode[];
  edges: UxEdge[];
  operations: DagOperation[];
}): DagPatchPreview {
  let revision = { ...input.revision };
  let nodes = [...input.nodes];
  let edges = [...input.edges];

  for (const operation of input.operations) {
    switch (operation.type) {
      case "set_goal_state":
        revision = { ...revision, goal_state: operation.goal_state };
        break;
      case "add_node":
        nodes = [...nodes, operation.node];
        break;
      case "update_node":
        nodes = nodes.map((node) =>
          node.uxNode_id === operation.node_id
            ? { ...node, ...operation.patch }
            : node,
        );
        break;
      case "remove_node":
        nodes = nodes.filter((node) => node.uxNode_id !== operation.node_id);
        edges = edges.filter(
          (edge) =>
            edge.from_node_id !== operation.node_id &&
            edge.to_node_id !== operation.node_id,
        );
        break;
      case "add_edge":
        edges = [...edges, operation.edge];
        break;
      case "update_edge":
        edges = edges.map((edge) =>
          edge.uxEdge_id === operation.edge_id
            ? { ...edge, ...operation.patch }
            : edge,
        );
        break;
      case "remove_edge":
        edges = edges.filter((edge) => edge.uxEdge_id !== operation.edge_id);
        break;
      case "split_node":
        nodes = [...nodes, operation.new_node];
        edges = [...edges, operation.edge];
        break;
      case "merge_nodes":
        edges = edges.map((edge) => ({
          ...edge,
          from_node_id:
            edge.from_node_id === operation.source_node_id
              ? operation.target_node_id
              : edge.from_node_id,
          to_node_id:
            edge.to_node_id === operation.source_node_id
              ? operation.target_node_id
              : edge.to_node_id,
        }));
        nodes = nodes.filter((node) => node.uxNode_id !== operation.source_node_id);
        break;
      case "mark_terminal":
        revision = {
          ...revision,
          terminal_node_ids: Array.from(
            new Set([...revision.terminal_node_ids, operation.node_id]),
          ),
        };
        nodes = nodes.map((node) =>
          node.uxNode_id === operation.node_id
            ? { ...node, node_type: "terminal" }
            : node,
        );
        break;
    }
  }

  return { revision, nodes, edges, operations: input.operations };
}

export function applyPreviewAsRevision(
  preview: DagPatchPreview,
  nextRevisionId: string,
): DagPatchPreview {
  return {
    ...preview,
    revision: {
      ...preview.revision,
      goalRevision_id: nextRevisionId,
      base_revision_id: preview.revision.goalRevision_id,
      created_at: new Date().toISOString(),
      change_summary: "Applied DAG change proposal.",
    },
    nodes: preview.nodes.map((node) => ({
      ...node,
      goal_revision_id: nextRevisionId,
    })),
    edges: preview.edges.map((edge) => ({
      ...edge,
      goal_revision_id: nextRevisionId,
    })),
  };
}
