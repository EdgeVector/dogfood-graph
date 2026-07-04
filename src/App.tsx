import { useMemo, useState } from "react";
import {
  fixtureEdges,
  fixtureFlow,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
  applyPreviewAsRevision,
  compileIntentToOperations,
  generateSessionDiffs,
  previewDagPatch,
  validateGoalDag,
  type DagChangeProposal,
  type DogfoodSession,
  type GoalRevision,
  type Observation,
  type ScreenshotAnnotation,
  type ScreenshotAsset,
  type UxEdge,
  type UxNode,
} from "./data";

const navItems = [
  "Flows",
  "DAG Editor",
  "Session Runner",
  "Evidence",
  "Diffs",
  "Proposals",
];

function App() {
  const [activeView, setActiveView] = useState("DAG Editor");
  const [revision, setRevision] = useState<GoalRevision>(fixtureGoalRevision);
  const [nodes, setNodes] = useState<UxNode[]>(fixtureNodes);
  const [edges, setEdges] = useState<UxEdge[]>(fixtureEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0].uxNode_id);
  const [selectedEdgeId, setSelectedEdgeId] = useState(edges[0].uxEdge_id);
  const [revisionCount, setRevisionCount] = useState(1);
  const [session, setSession] = useState<DogfoodSession>({
    ...fixtureSession,
    status: "in_progress",
    ended_at: undefined,
  });
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentRunNodeId, setCurrentRunNodeId] = useState(revision.entry_node_ids[0]);
  const [observations, setObservations] = useState<Observation[]>(fixtureObservations);
  const [screenshots, setScreenshots] = useState<ScreenshotAsset[]>([
    {
      screenshotAsset_id: "screenshot-seed",
      observation_id: fixtureObservations[0].observation_id,
      asset_ref: "local://seed-installer-screen",
      mime_type: "image/png",
      width: "1440",
      height: "900",
      byte_size: "metadata-only",
      captured_at: fixtureObservations[0].captured_at,
      redaction_state: "safe_to_share",
      caption: "Installer setup entry point.",
    },
  ]);
  const [annotations, setAnnotations] = useState<ScreenshotAnnotation[]>([
    {
      screenshotAnnotation_id: "annotation-seed",
      screenshot_id: "screenshot-seed",
      shape: "rect",
      geometry: "x=0.12,y=0.18,w=0.34,h=0.12",
      label: "Setup CTA",
      body: "Primary setup entry point is visible.",
      severity: "info",
      linked_expected_check: "Installer shows setup entry point",
    },
  ]);
  const [selectedObservationId, setSelectedObservationId] = useState(
    fixtureObservations[0].observation_id,
  );
  const [selectedScreenshotId, setSelectedScreenshotId] = useState("screenshot-seed");
  const [annotationDraft, setAnnotationDraft] = useState({
    shape: "rect" as ScreenshotAnnotation["shape"],
    geometry: "x=0.10,y=0.10,w=0.30,h=0.20",
    label: "Visible issue",
    body: "",
    severity: "papercut" as ScreenshotAnnotation["severity"],
    linked_expected_check: "",
  });
  const [proposalIntent, setProposalIntent] = useState(
    "Add a recovery phrase confirmation screen before the dashboard.",
  );
  const [proposals, setProposals] = useState<DagChangeProposal[]>([]);
  const [capture, setCapture] = useState({
    actual_title: "Installer opened",
    actual_state: "Setup entry point was visible.",
    actual_action: "",
    actual_result: "",
    selected_edge_id: edges[0].uxEdge_id,
    verdict: "matches" as Observation["verdict"],
    notes: "",
    unexpected: false,
  });

  const selectedNode = nodes.find((node) => node.uxNode_id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.uxEdge_id === selectedEdgeId);
  const currentRunNode = nodes.find((node) => node.uxNode_id === currentRunNodeId);
  const availableBranches = edges.filter((edge) => edge.from_node_id === currentRunNodeId);
  const selectedObservation = observations.find(
    (observation) => observation.observation_id === selectedObservationId,
  );
  const observationScreenshots = screenshots.filter(
    (screenshot) => screenshot.observation_id === selectedObservationId,
  );
  const selectedScreenshot =
    screenshots.find((screenshot) => screenshot.screenshotAsset_id === selectedScreenshotId) ??
    observationScreenshots[0];
  const screenshotAnnotations = annotations.filter(
    (annotation) => annotation.screenshot_id === selectedScreenshot?.screenshotAsset_id,
  );
  const generatedDiffs = useMemo(
    () =>
      generateSessionDiffs({
        session,
        revision,
        nodes,
        edges,
        observations,
        screenshots,
      }),
    [session, revision, nodes, edges, observations, screenshots],
  );
  const diffGroups = useMemo(
    () =>
      generatedDiffs.reduce(
        (groups, diff) => {
          groups[diff.severity] = [...(groups[diff.severity] ?? []), diff];
          return groups;
        },
        {} as Record<string, typeof generatedDiffs>,
      ),
    [generatedDiffs],
  );
  const proposalOperations = useMemo(
    () =>
      compileIntentToOperations({
        intent: proposalIntent,
        revision,
        nodes,
      }),
    [proposalIntent, revision, nodes],
  );
  const proposalPreview = useMemo(
    () =>
      previewDagPatch({
        revision,
        nodes,
        edges,
        operations: proposalOperations,
      }),
    [revision, nodes, edges, proposalOperations],
  );
  const proposalValidationIssues = useMemo(
    () =>
      validateGoalDag(
        proposalPreview.revision,
        proposalPreview.nodes,
        proposalPreview.edges,
      ),
    [proposalPreview],
  );
  const validationIssues = useMemo(
    () => validateGoalDag(revision, nodes, edges),
    [revision, nodes, edges],
  );
  const stats = [
    {
      label: "UX Nodes",
      value: String(nodes.length),
      detail: "Expected states and actions",
    },
    {
      label: "Branches",
      value: String(edges.length),
      detail: "User choices and transitions",
    },
    {
      label: "Issues",
      value: String(validationIssues.length),
      detail: "Validation findings",
    },
  ];

  function updateNode(id: string, patch: Partial<UxNode>) {
    setNodes((current) =>
      current.map((node) => (node.uxNode_id === id ? { ...node, ...patch } : node)),
    );
  }

  function updateEdge(id: string, patch: Partial<UxEdge>) {
    setEdges((current) =>
      current.map((edge) => (edge.uxEdge_id === id ? { ...edge, ...patch } : edge)),
    );
  }

  function addNode() {
    const nextIndex = nodes.length + 1;
    const next: UxNode = {
      uxNode_id: `node-draft-${nextIndex}`,
      goal_revision_id: revision.goalRevision_id,
      node_type: "screen",
      title: `Draft node ${nextIndex}`,
      expected_state: "Describe the expected user-visible state.",
      expected_action: "",
      expected_result: "",
      acceptance_checks: ["Add an observable acceptance check"],
      failure_modes: [],
    };
    setNodes((current) => [...current, next]);
    setSelectedNodeId(next.uxNode_id);
  }

  function addEdge() {
    const fromNode = selectedNode ?? nodes[0];
    const toNode = nodes.find((node) => node.uxNode_id !== fromNode.uxNode_id) ?? fromNode;
    const nextIndex = edges.length + 1;
    const next: UxEdge = {
      uxEdge_id: `edge-draft-${nextIndex}`,
      goal_revision_id: revision.goalRevision_id,
      from_node_id: fromNode.uxNode_id,
      to_node_id: toNode.uxNode_id,
      trigger_type: "user_action",
      label: `Branch ${nextIndex}`,
      condition: "",
      expected_latency: "",
      priority: String(nextIndex),
    };
    setEdges((current) => [...current, next]);
    setSelectedEdgeId(next.uxEdge_id);
  }

  function applyAsNewRevision() {
    const nextNumber = revisionCount + 1;
    const nextRevisionId = `goal-setup-v${nextNumber}`;
    setRevision({
      ...revision,
      goalRevision_id: nextRevisionId,
      base_revision_id: revision.goalRevision_id,
      created_at: new Date().toISOString(),
      change_summary: `Applied structured DAG edits as revision ${nextNumber}.`,
    });
    setNodes((current) =>
      current.map((node) => ({ ...node, goal_revision_id: nextRevisionId })),
    );
    setEdges((current) =>
      current.map((edge) => ({ ...edge, goal_revision_id: nextRevisionId })),
    );
    setRevisionCount(nextNumber);
  }

  function startSession() {
    setSessionStarted(true);
    setSession((current) => ({
      ...current,
      goal_revision_id: revision.goalRevision_id,
      started_at: new Date().toISOString(),
      status: "in_progress",
      ended_at: undefined,
    }));
    setCurrentRunNodeId(revision.entry_node_ids[0]);
  }

  function recordObservation() {
    const selectedBranch = edges.find(
      (edge) => edge.uxEdge_id === capture.selected_edge_id,
    );
    const nextObservation: Observation = {
      observation_id: `observation-${observations.length + 1}`,
      session_id: session.dogfoodSession_id,
      expected_node_id: capture.unexpected ? undefined : currentRunNodeId,
      actual_title: capture.actual_title,
      actual_state: capture.actual_state,
      actual_action: capture.actual_action,
      actual_result: capture.actual_result,
      selected_edge_id: capture.unexpected ? undefined : capture.selected_edge_id,
      actual_next_node_label: capture.unexpected ? "Unexpected step" : undefined,
      verdict: capture.unexpected ? "unexpected" : capture.verdict,
      notes: capture.notes,
      captured_at: new Date().toISOString(),
    };
    setObservations((current) => [...current, nextObservation]);
    setSelectedObservationId(nextObservation.observation_id);
    if (selectedBranch && !capture.unexpected) {
      setCurrentRunNodeId(selectedBranch.to_node_id);
      setCapture((current) => ({
        ...current,
        actual_title:
          nodes.find((node) => node.uxNode_id === selectedBranch.to_node_id)?.title ??
          current.actual_title,
        actual_state: "",
        actual_action: "",
        actual_result: "",
        notes: "",
        selected_edge_id:
          edges.find((edge) => edge.from_node_id === selectedBranch.to_node_id)?.uxEdge_id ??
          selectedBranch.uxEdge_id,
      }));
    } else {
      setCapture((current) => ({ ...current, notes: "" }));
    }
  }

  function finishSession(status: DogfoodSession["status"]) {
    setSession((current) => ({
      ...current,
      status,
      ended_at: new Date().toISOString(),
      summary: `${observations.length} observations recorded.`,
    }));
  }

  function addScreenshotFromFile(file: File) {
    const nextId = `screenshot-${screenshots.length + 1}`;
    const next: ScreenshotAsset = {
      screenshotAsset_id: nextId,
      observation_id: selectedObservationId,
      asset_ref: `local://${file.name}`,
      mime_type: file.type || "application/octet-stream",
      width: "unknown",
      height: "unknown",
      byte_size: String(file.size),
      captured_at: new Date().toISOString(),
      redaction_state: "raw",
      caption: file.name,
    };
    setScreenshots((current) => [...current, next]);
    setSelectedScreenshotId(nextId);
  }

  function addPastedScreenshot() {
    const nextId = `screenshot-${screenshots.length + 1}`;
    const next: ScreenshotAsset = {
      screenshotAsset_id: nextId,
      observation_id: selectedObservationId,
      asset_ref: `clipboard://${nextId}`,
      mime_type: "image/png",
      width: "unknown",
      height: "unknown",
      byte_size: "clipboard",
      captured_at: new Date().toISOString(),
      redaction_state: "raw",
      caption: "Pasted screenshot evidence",
    };
    setScreenshots((current) => [...current, next]);
    setSelectedScreenshotId(nextId);
  }

  function addAnnotation() {
    if (!selectedScreenshot) return;
    const next: ScreenshotAnnotation = {
      screenshotAnnotation_id: `annotation-${annotations.length + 1}`,
      screenshot_id: selectedScreenshot.screenshotAsset_id,
      ...annotationDraft,
    };
    setAnnotations((current) => [...current, next]);
    setAnnotationDraft((current) => ({ ...current, body: "" }));
  }

  function applyProposal() {
    const nextNumber = revisionCount + 1;
    const nextRevisionId = `goal-setup-v${nextNumber}`;
    const applied = applyPreviewAsRevision(proposalPreview, nextRevisionId);
    const proposal: DagChangeProposal = {
      dagChangeProposal_id: `proposal-${proposals.length + 1}`,
      flow_id: fixtureFlow.dogfoodFlow_id,
      base_goal_revision_id: revision.goalRevision_id,
      author: "dogfood-graph",
      created_at: new Date().toISOString(),
      intent: proposalIntent,
      ops: JSON.stringify(proposalOperations, null, 2),
      status: "applied",
      result_goal_revision_id: nextRevisionId,
    };
    setRevision(applied.revision);
    setNodes(applied.nodes);
    setEdges(applied.edges);
    setRevisionCount(nextNumber);
    setProposals((current) => [...current, proposal]);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            DG
          </div>
          <div>
            <p className="eyebrow">EdgeVector</p>
            <h1>Dogfood Graph</h1>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <button
              type="button"
              key={item}
              className={item === activeView ? "active" : undefined}
              onClick={() => setActiveView(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace" aria-labelledby="workspace-title">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{fixtureFlow.title}</p>
            <h2 id="workspace-title">{activeView}</h2>
          </div>
          {activeView === "DAG Editor" ? (
            <button type="button" onClick={applyAsNewRevision}>
              Apply As New Revision
            </button>
          ) : null}
        </header>

        <section className="overview-grid" aria-label="Dogfood Graph summary">
          {stats.map((card) => (
            <article key={card.label} className="summary-card">
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </article>
          ))}
        </section>

        {activeView === "DAG Editor" ? (
          <section className="editor-grid" aria-label="DAG editor">
            <article className="panel node-list">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Revision {revision.goalRevision_id}</p>
                  <h3>Nodes</h3>
                </div>
                <button type="button" onClick={addNode}>
                  Add Node
                </button>
              </div>

              <div className="outline-list">
                {nodes.map((node) => (
                  <button
                    type="button"
                    key={node.uxNode_id}
                    className={node.uxNode_id === selectedNodeId ? "selected" : undefined}
                    onClick={() => setSelectedNodeId(node.uxNode_id)}
                  >
                    <span>{node.title}</span>
                    <small>{node.node_type}</small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel inspector">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Expectation</p>
                  <h3>Selected Node</h3>
                </div>
              </div>
              {selectedNode ? (
                <div className="form-grid">
                  <label>
                    Title
                    <input
                      value={selectedNode.title}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={selectedNode.node_type}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          node_type: event.target.value as UxNode["node_type"],
                        })
                      }
                    >
                      <option value="screen">screen</option>
                      <option value="action">action</option>
                      <option value="choice">choice</option>
                      <option value="system_state">system_state</option>
                      <option value="terminal">terminal</option>
                    </select>
                  </label>
                  <label>
                    Expected State
                    <textarea
                      value={selectedNode.expected_state}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          expected_state: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Expected Action
                    <textarea
                      value={selectedNode.expected_action ?? ""}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          expected_action: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Expected Result
                    <textarea
                      value={selectedNode.expected_result ?? ""}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          expected_result: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Acceptance Checks
                    <textarea
                      value={selectedNode.acceptance_checks.join("\n")}
                      onChange={(event) =>
                        updateNode(selectedNode.uxNode_id, {
                          acceptance_checks: event.target.value
                            .split("\n")
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </article>

            <article className="panel edge-list">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Branches</p>
                  <h3>Edges</h3>
                </div>
                <button type="button" onClick={addEdge}>
                  Add Edge
                </button>
              </div>
              <div className="outline-list">
                {edges.map((edge) => (
                  <button
                    type="button"
                    key={edge.uxEdge_id}
                    className={edge.uxEdge_id === selectedEdgeId ? "selected" : undefined}
                    onClick={() => setSelectedEdgeId(edge.uxEdge_id)}
                  >
                    <span>{edge.label || "Unlabeled branch"}</span>
                    <small>
                      {edge.from_node_id} {"->"} {edge.to_node_id}
                    </small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel inspector">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Transition</p>
                  <h3>Selected Edge</h3>
                </div>
              </div>
              {selectedEdge ? (
                <div className="form-grid">
                  <label>
                    Label
                    <input
                      value={selectedEdge.label}
                      onChange={(event) =>
                        updateEdge(selectedEdge.uxEdge_id, {
                          label: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    From
                    <select
                      value={selectedEdge.from_node_id}
                      onChange={(event) =>
                        updateEdge(selectedEdge.uxEdge_id, {
                          from_node_id: event.target.value,
                        })
                      }
                    >
                      {nodes.map((node) => (
                        <option value={node.uxNode_id} key={node.uxNode_id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To
                    <select
                      value={selectedEdge.to_node_id}
                      onChange={(event) =>
                        updateEdge(selectedEdge.uxEdge_id, {
                          to_node_id: event.target.value,
                        })
                      }
                    >
                      {nodes.map((node) => (
                        <option value={node.uxNode_id} key={node.uxNode_id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Condition
                    <textarea
                      value={selectedEdge.condition ?? ""}
                      onChange={(event) =>
                        updateEdge(selectedEdge.uxEdge_id, {
                          condition: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </article>

            <article className="panel validation-panel">
              <div>
                <p className="eyebrow">Validation</p>
                <h3>{validationIssues.length === 0 ? "Graph Valid" : "Needs Attention"}</h3>
              </div>
              {validationIssues.length === 0 ? (
                <p>Every node is reachable, branches are labeled, and exits resolve to a terminal goal.</p>
              ) : (
                <ul>
                  {validationIssues.map((issue) => (
                    <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? issue.message}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : activeView === "Session Runner" ? (
          <section className="runner-grid" aria-label="Session runner">
            <article className="panel session-setup">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Run Setup</p>
                  <h3>Dogfood Session</h3>
                </div>
                <span className={`status-pill status-${session.status}`}>
                  {session.status}
                </span>
              </div>
              <div className="form-grid">
                <label>
                  Dogfooder
                  <input
                    value={session.dogfooder}
                    onChange={(event) =>
                      setSession((current) => ({
                        ...current,
                        dogfooder: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Environment
                  <textarea
                    value={session.environment}
                    onChange={(event) =>
                      setSession((current) => ({
                        ...current,
                        environment: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Path Intent
                  <textarea
                    value={session.path_intent ?? ""}
                    onChange={(event) =>
                      setSession((current) => ({
                        ...current,
                        path_intent: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button type="button" onClick={startSession}>
                {sessionStarted ? "Restart Session" : "Start Session"}
              </button>
            </article>

            <article className="panel current-node-panel">
              <div>
                <p className="eyebrow">Current Expected Node</p>
                <h3>{currentRunNode?.title ?? "No node selected"}</h3>
                <p>{currentRunNode?.expected_state}</p>
              </div>
              <div className="branch-list">
                {availableBranches.length === 0 ? (
                  <p>No outgoing branches from this node.</p>
                ) : (
                  availableBranches.map((edge) => (
                    <button
                      type="button"
                      key={edge.uxEdge_id}
                      className={
                        edge.uxEdge_id === capture.selected_edge_id ? "selected" : undefined
                      }
                      onClick={() =>
                        setCapture((current) => ({
                          ...current,
                          selected_edge_id: edge.uxEdge_id,
                          unexpected: false,
                        }))
                      }
                    >
                      {edge.label}
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="panel capture-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Observation Capture</p>
                  <h3>Record Actual Behavior</h3>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={capture.unexpected}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        unexpected: event.target.checked,
                      }))
                    }
                  />
                  Unexpected
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Actual Title
                  <input
                    value={capture.actual_title}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        actual_title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Actual State
                  <textarea
                    value={capture.actual_state}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        actual_state: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Actual Action
                  <textarea
                    value={capture.actual_action}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        actual_action: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Actual Result
                  <textarea
                    value={capture.actual_result}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        actual_result: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Verdict
                  <select
                    value={capture.verdict}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        verdict: event.target.value as Observation["verdict"],
                      }))
                    }
                  >
                    <option value="matches">matches</option>
                    <option value="minor_delta">minor_delta</option>
                    <option value="major_delta">major_delta</option>
                    <option value="blocked">blocked</option>
                    <option value="unexpected">unexpected</option>
                  </select>
                </label>
                <label>
                  Notes
                  <textarea
                    value={capture.notes}
                    onChange={(event) =>
                      setCapture((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button type="button" onClick={recordObservation} disabled={!sessionStarted}>
                Record Observation
              </button>
            </article>

            <article className="panel timeline-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Path Timeline</p>
                  <h3>{observations.length} Observations</h3>
                </div>
                <div className="status-actions">
                  <button type="button" onClick={() => finishSession("completed")}>
                    Complete
                  </button>
                  <button type="button" onClick={() => finishSession("blocked")}>
                    Block
                  </button>
                  <button type="button" onClick={() => finishSession("abandoned")}>
                    Abandon
                  </button>
                </div>
              </div>
              <div className="timeline-list">
                {observations.map((observation) => (
                  <article key={observation.observation_id}>
                    <strong>{observation.actual_title}</strong>
                    <span>{observation.verdict}</span>
                    <p>{observation.actual_state}</p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : activeView === "Evidence" ? (
          <section className="evidence-grid" aria-label="Evidence review">
            <article className="panel observation-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Observations</p>
                  <h3>Session Evidence</h3>
                </div>
              </div>
              <div className="outline-list">
                {observations.map((observation) => (
                  <button
                    type="button"
                    key={observation.observation_id}
                    className={
                      observation.observation_id === selectedObservationId
                        ? "selected"
                        : undefined
                    }
                    onClick={() => {
                      setSelectedObservationId(observation.observation_id);
                      const firstScreenshot = screenshots.find(
                        (screenshot) =>
                          screenshot.observation_id === observation.observation_id,
                      );
                      if (firstScreenshot) {
                        setSelectedScreenshotId(firstScreenshot.screenshotAsset_id);
                      }
                    }}
                  >
                    <span>{observation.actual_title}</span>
                    <small>{observation.verdict}</small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel evidence-drop-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Screenshot Assets</p>
                  <h3>{selectedObservation?.actual_title ?? "Select observation"}</h3>
                </div>
                <span className="status-pill">{observationScreenshots.length}</span>
              </div>
              <div
                className="drop-zone"
                tabIndex={0}
                onPaste={(event) => {
                  if (event.clipboardData.files.length > 0) {
                    addScreenshotFromFile(event.clipboardData.files[0]);
                  } else {
                    addPastedScreenshot();
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) addScreenshotFromFile(file);
                }}
              >
                <strong>Drop or paste screenshot evidence</strong>
                <span>Metadata is stored separately from image bytes.</span>
                <input
                  aria-label="Upload screenshot"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) addScreenshotFromFile(file);
                  }}
                />
              </div>

              <div className="screenshot-list">
                {observationScreenshots.map((screenshot) => (
                  <button
                    type="button"
                    key={screenshot.screenshotAsset_id}
                    className={
                      screenshot.screenshotAsset_id === selectedScreenshot?.screenshotAsset_id
                        ? "selected"
                        : undefined
                    }
                    onClick={() => setSelectedScreenshotId(screenshot.screenshotAsset_id)}
                  >
                    <strong>{screenshot.caption}</strong>
                    <span>{screenshot.mime_type}</span>
                    <span>{screenshot.byte_size} bytes</span>
                    <span>{screenshot.redaction_state}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel annotation-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Annotations</p>
                  <h3>{selectedScreenshot?.caption ?? "No screenshot selected"}</h3>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Shape
                  <select
                    value={annotationDraft.shape}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        shape: event.target.value as ScreenshotAnnotation["shape"],
                      }))
                    }
                  >
                    <option value="rect">rect</option>
                    <option value="arrow">arrow</option>
                    <option value="pin">pin</option>
                    <option value="freehand">freehand</option>
                  </select>
                </label>
                <label>
                  Geometry
                  <input
                    value={annotationDraft.geometry}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        geometry: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Label
                  <input
                    value={annotationDraft.label}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Severity
                  <select
                    value={annotationDraft.severity}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        severity: event.target.value as ScreenshotAnnotation["severity"],
                      }))
                    }
                  >
                    <option value="info">info</option>
                    <option value="papercut">papercut</option>
                    <option value="bug">bug</option>
                    <option value="blocker">blocker</option>
                  </select>
                </label>
                <label>
                  Linked Expected Check
                  <input
                    value={annotationDraft.linked_expected_check}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        linked_expected_check: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Note
                  <textarea
                    value={annotationDraft.body}
                    onChange={(event) =>
                      setAnnotationDraft((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button type="button" onClick={addAnnotation} disabled={!selectedScreenshot}>
                Add Annotation
              </button>

              <div className="annotation-list">
                {screenshotAnnotations.map((annotation) => (
                  <article key={annotation.screenshotAnnotation_id}>
                    <strong>{annotation.label}</strong>
                    <span>{annotation.shape}</span>
                    <p>{annotation.body || annotation.geometry}</p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : activeView === "Diffs" ? (
          <section className="diff-grid" aria-label="Diff review">
            <article className="panel diff-summary">
              <div>
                <p className="eyebrow">Generated Review</p>
                <h3>{generatedDiffs.length} Diff Items</h3>
              </div>
              <div className="diff-counts">
                {["blocker", "bug", "papercut", "info"].map((severity) => (
                  <span key={severity}>
                    <strong>{diffGroups[severity]?.length ?? 0}</strong>
                    {severity}
                  </span>
                ))}
              </div>
            </article>

            {["blocker", "bug", "papercut", "info"].map((severity) => (
              <article className="panel diff-group" key={severity}>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">{severity}</p>
                    <h3>{diffGroups[severity]?.length ?? 0} Items</h3>
                  </div>
                </div>
                <div className="diff-list">
                  {(diffGroups[severity] ?? []).map((diff) => (
                    <article key={diff.diffItem_id}>
                      <div>
                        <strong>{diff.category}</strong>
                        <span>{diff.suggested_next_action}</span>
                      </div>
                      <p>{diff.summary}</p>
                      <small>
                        {diff.expected_ref ? `Expected: ${diff.expected_ref}` : "No expected ref"}
                        {diff.observation_id ? ` | Observation: ${diff.observation_id}` : ""}
                        {diff.screenshot_ids.length > 0
                          ? ` | Screenshots: ${diff.screenshot_ids.join(", ")}`
                          : ""}
                      </small>
                    </article>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : activeView === "Proposals" ? (
          <section className="proposal-grid" aria-label="DAG change proposals">
            <article className="panel proposal-editor">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Intent</p>
                  <h3>Change Proposal</h3>
                </div>
              </div>
              <label>
                User Intent
                <textarea
                  value={proposalIntent}
                  onChange={(event) => setProposalIntent(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={applyProposal}
                disabled={proposalValidationIssues.length > 0}
              >
                Apply Proposal
              </button>
            </article>

            <article className="panel operation-preview">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h3>{proposalOperations.length} Operations</h3>
                </div>
                <span className="status-pill">
                  {proposalValidationIssues.length === 0 ? "valid" : "blocked"}
                </span>
              </div>
              <div className="operation-list">
                {proposalOperations.map((operation, index) => (
                  <article key={`${operation.type}-${index}`}>
                    <strong>{operation.type}</strong>
                    <code>{JSON.stringify(operation)}</code>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel proposal-validation">
              <div>
                <p className="eyebrow">Patch Validation</p>
                <h3>
                  {proposalValidationIssues.length === 0
                    ? "Preview Valid"
                    : "Preview Blocked"}
                </h3>
              </div>
              {proposalValidationIssues.length === 0 ? (
                <p>
                  The preview creates {proposalPreview.nodes.length} nodes and{" "}
                  {proposalPreview.edges.length} edges in a new immutable revision.
                </p>
              ) : (
                <ul>
                  {proposalValidationIssues.map((issue) => (
                    <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel proposal-history">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">History</p>
                  <h3>{proposals.length} Applied</h3>
                </div>
              </div>
              <div className="timeline-list">
                {proposals.map((proposal) => (
                  <article key={proposal.dagChangeProposal_id}>
                    <strong>{proposal.intent}</strong>
                    <span>{proposal.status}</span>
                    <p>Result: {proposal.result_goal_revision_id}</p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : (
          <div className="empty-state">
            <h3>{activeView} is queued</h3>
            <p>The next implementation slices will fill this view.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
