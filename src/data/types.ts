export type DogfoodFlow = {
  dogfoodFlow_id: string;
  title: string;
  scope: string;
  owner: string;
  status: "draft" | "active" | "superseded" | "archived";
  current_goal_revision_id?: string;
  tags: string[];
};

export type GoalRevision = {
  goalRevision_id: string;
  flow_id: string;
  base_revision_id?: string;
  created_at: string;
  created_by: string;
  change_summary: string;
  goal_state: string;
  entry_node_ids: string[];
  terminal_node_ids: string[];
};

export type UxNode = {
  uxNode_id: string;
  goal_revision_id: string;
  node_type: "screen" | "action" | "choice" | "system_state" | "terminal";
  title: string;
  expected_state: string;
  expected_action?: string;
  expected_result?: string;
  acceptance_checks: string[];
  failure_modes: string[];
  copy_expectations?: string;
  data_expectations?: string;
  ux_notes?: string;
  loop_allowed?: "true" | "false";
};

export type UxEdge = {
  uxEdge_id: string;
  goal_revision_id: string;
  from_node_id: string;
  to_node_id: string;
  trigger_type: "user_choice" | "user_action" | "system_transition" | "error";
  label: string;
  condition?: string;
  expected_latency?: string;
  priority: string;
};

export type DogfoodSession = {
  dogfoodSession_id: string;
  flow_id: string;
  goal_revision_id: string;
  started_at: string;
  ended_at?: string;
  dogfooder: string;
  environment: string;
  path_intent?: string;
  status: "in_progress" | "blocked" | "completed" | "abandoned";
  summary?: string;
};

export type Observation = {
  observation_id: string;
  session_id: string;
  expected_node_id?: string;
  actual_title: string;
  actual_state: string;
  actual_action?: string;
  actual_result?: string;
  selected_edge_id?: string;
  actual_next_node_label?: string;
  verdict: "matches" | "minor_delta" | "major_delta" | "blocked" | "unexpected";
  notes?: string;
  captured_at: string;
};

export type ScreenshotAsset = {
  screenshotAsset_id: string;
  observation_id: string;
  asset_ref: string;
  mime_type: string;
  width: string;
  height: string;
  byte_size: string;
  captured_at: string;
  redaction_state: "raw" | "redacted" | "safe_to_share";
  caption?: string;
};

export type ScreenshotAnnotation = {
  screenshotAnnotation_id: string;
  screenshot_id: string;
  shape: "rect" | "arrow" | "pin" | "freehand";
  geometry: string;
  label: string;
  body?: string;
  severity: "info" | "papercut" | "bug" | "blocker";
  linked_expected_check?: string;
};

export type DiffItem = {
  diffItem_id: string;
  session_id: string;
  goal_revision_id: string;
  category:
    | "missing_node"
    | "unexpected_node"
    | "state_delta"
    | "action_delta"
    | "result_delta"
    | "branch_delta"
    | "blocked"
    | "evidence_gap"
    | "note"
    | "goal_satisfied"
    | "goal_not_satisfied";
  expected_ref?: string;
  observation_id?: string;
  severity: "info" | "papercut" | "bug" | "blocker";
  summary: string;
  suggested_next_action: "update_goal" | "file_product_bug" | "rerun" | "accept";
  screenshot_ids: string[];
};

export type DagChangeProposal = {
  dagChangeProposal_id: string;
  flow_id: string;
  base_goal_revision_id: string;
  author: string;
  created_at: string;
  intent: string;
  ops: string;
  status: "draft" | "reviewed" | "applied" | "rejected";
  result_goal_revision_id?: string;
};

export type DogfoodRecordMap = {
  DogfoodFlow: DogfoodFlow;
  GoalRevision: GoalRevision;
  UxNode: UxNode;
  UxEdge: UxEdge;
  DogfoodSession: DogfoodSession;
  Observation: Observation;
  ScreenshotAsset: ScreenshotAsset;
  ScreenshotAnnotation: ScreenshotAnnotation;
  DiffItem: DiffItem;
  DagChangeProposal: DagChangeProposal;
};
