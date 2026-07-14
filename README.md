# Dogfood Graph

Dogfood Graph is a LastDB-native app for managing manual product dogfooding.

It models expected UX as a versioned DAG of user-visible states, actions, and
branch options. Dogfood sessions record what humans actually observed while
walking the product, including screenshots and annotations. The app then
compares expected behavior against actual evidence and produces a structured
diff.

Dogfood Graph does not automate product testing. It manages the goal state, the
observed state, and the evidence needed to decide whether the product, the
expectation, or the dogfood path needs to change.

## Core Concepts

- **Goal state**: the intended UX DAG for a feature, release gate, or workflow.
- **UX nodes**: screens, actions, choices, system states, and terminal states.
- **UX edges**: user options or system transitions between nodes.
- **Dogfood sessions**: human runs against a specific goal revision.
- **Observations**: actual state, action, result, verdict, notes, and evidence.
- **Screenshots**: attached image evidence with non-destructive annotations.
- **Diffs**: expected-vs-actual deltas grouped by severity and next action.

## Initial Scope

The first implementation should focus on:

1. App-local LastDB schemas for flows, goal revisions, nodes, edges, sessions,
   observations, screenshots, annotations, and DAG change proposals.
2. A DAG editor for defining expected user paths and branching options.
3. A session runner for recording actual dogfood evidence.
4. Screenshot attachment and annotation support.
5. Diff generation between a dogfood session and the goal revision it ran
   against.
6. Controlled DAG updates from user-authored change proposals.

## Repository Status

This repo contains the initial public app scaffold. Implementation planning is
tracked in F-Brain and executable PR-sized work is tracked in F-Kanban.

The canonical repository is `lastdb:///dogfood-graph`. GitHub
`EdgeVector/dogfood-graph` is a public read-only mirror; review artifacts should
be LastGit change requests gated by `.lastgit/ci.sh`.

## Local Development

Requirements:

- Node.js 22 or newer
- npm 10 or newer

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Run the validation suite:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Validate repository bootstrap guidance and local Git credential hygiene:

```sh
npm run verify:repo-bootstrap
```

See [EdgeVector Repo Bootstrap](docs/repo-bootstrap.md) before creating or
seeding new public EdgeVector repositories.

## App Stack

- Vite for the local dev server and production build
- React with TypeScript for the UI
- Vitest and Testing Library for component tests
- ESLint for static checks
- GitHub Actions for CI on pull requests and pushes to `main`
