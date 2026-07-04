import type {
  DogfoodFlow,
  DogfoodSession,
  GoalRevision,
  Observation,
  UxEdge,
  UxNode,
} from "./types";

export const fixtureFlow: DogfoodFlow = {
  dogfoodFlow_id: "flow-lastdb-setup",
  title: "LastDB setup",
  scope: "LastDB desktop onboarding",
  owner: "EdgeVector",
  status: "active",
  current_goal_revision_id: "goal-setup-v1",
  tags: ["onboarding", "release-gate"],
};

export const fixtureGoalRevision: GoalRevision = {
  goalRevision_id: "goal-setup-v1",
  flow_id: fixtureFlow.dogfoodFlow_id,
  created_at: "2026-07-04T00:00:00.000Z",
  created_by: "dogfood-graph",
  change_summary: "Initial branched setup path.",
  goal_state:
    "A new user completes setup and lands on a ready dashboard with a healthy local node.",
  entry_node_ids: ["node-start"],
  terminal_node_ids: ["node-dashboard-ready"],
};

export const fixtureNodes: UxNode[] = [
  {
    uxNode_id: "node-start",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    node_type: "screen",
    title: "Installer opened",
    expected_state: "The user can start setup from the installer.",
    acceptance_checks: ["Installer shows setup entry point"],
    failure_modes: [],
  },
  {
    uxNode_id: "node-setup-choice",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    node_type: "choice",
    title: "Choose setup path",
    expected_state: "The user can choose new setup or restore.",
    acceptance_checks: ["New setup option is visible", "Restore option is visible"],
    failure_modes: [],
  },
  {
    uxNode_id: "node-dashboard-ready",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    node_type: "terminal",
    title: "Dashboard ready",
    expected_state: "Dashboard shows a healthy local database.",
    acceptance_checks: ["Local node health is visible"],
    failure_modes: [],
  },
];

export const fixtureEdges: UxEdge[] = [
  {
    uxEdge_id: "edge-start-choice",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    from_node_id: "node-start",
    to_node_id: "node-setup-choice",
    trigger_type: "user_action",
    label: "Start setup",
    priority: "1",
  },
  {
    uxEdge_id: "edge-new-dashboard",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    from_node_id: "node-setup-choice",
    to_node_id: "node-dashboard-ready",
    trigger_type: "user_choice",
    label: "Set up new database",
    priority: "1",
  },
  {
    uxEdge_id: "edge-restore-dashboard",
    goal_revision_id: fixtureGoalRevision.goalRevision_id,
    from_node_id: "node-setup-choice",
    to_node_id: "node-dashboard-ready",
    trigger_type: "user_choice",
    label: "Restore from recovery phrase",
    priority: "2",
  },
];

export const fixtureSession: DogfoodSession = {
  dogfoodSession_id: "session-setup-1",
  flow_id: fixtureFlow.dogfoodFlow_id,
  goal_revision_id: fixtureGoalRevision.goalRevision_id,
  started_at: "2026-07-04T01:00:00.000Z",
  dogfooder: "tom",
  environment: "macOS, local dev",
  status: "completed",
  summary: "Completed the new setup branch.",
};

export const fixtureObservations: Observation[] = [
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
    observation_id: "observation-choice",
    session_id: fixtureSession.dogfoodSession_id,
    expected_node_id: "node-setup-choice",
    actual_title: "Setup path choice",
    actual_state: "New setup and restore choices were visible.",
    selected_edge_id: "edge-new-dashboard",
    verdict: "matches",
    captured_at: "2026-07-04T01:02:00.000Z",
  },
];
