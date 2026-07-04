const flowCards = [
  {
    label: "Goal DAG",
    value: "0",
    detail: "Versioned UX expectations",
  },
  {
    label: "Sessions",
    value: "0",
    detail: "Manual dogfood runs",
  },
  {
    label: "Open Diffs",
    value: "0",
    detail: "Expected-vs-actual deltas",
  },
];

const navItems = ["Flows", "DAG Editor", "Session Runner", "Evidence", "Diffs"];

function App() {
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
            <a
              href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
              key={item}
              className={item === "Flows" ? "active" : undefined}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <section className="workspace" aria-labelledby="workspace-title">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">App Shell</p>
            <h2 id="workspace-title">Flows</h2>
          </div>
          <button type="button">New Flow</button>
        </header>

        <section className="overview-grid" aria-label="Dogfood Graph summary">
          {flowCards.map((card) => (
            <article key={card.label} className="summary-card">
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </article>
          ))}
        </section>

        <section className="empty-state" aria-label="Empty flows state">
          <div className="graph-preview" aria-hidden="true">
            <span className="node node-entry">Start</span>
            <span className="edge edge-a" />
            <span className="node node-choice">Choice</span>
            <span className="edge edge-b" />
            <span className="node node-terminal">Done</span>
          </div>
          <div>
            <p className="eyebrow">Ready for the first schema slice</p>
            <h3>No dogfood flows yet</h3>
            <p>
              The shell is ready for LastDB-backed flows, goal revisions, UX
              nodes, sessions, evidence, and generated diffs.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
