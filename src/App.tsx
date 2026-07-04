import { useMemo, useState } from "react";
import {
  fixtureEdges,
  fixtureFlow,
  fixtureGoalRevision,
  fixtureNodes,
  fixtureObservations,
  fixtureSession,
  validateGoalDag,
  type DogfoodSession,
  type GoalRevision,
  type Observation,
  type UxEdge,
  type UxNode,
} from "./data";

const navItems = ["Flows", "DAG Editor", "Session Runner", "Evidence", "Diffs"];

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
