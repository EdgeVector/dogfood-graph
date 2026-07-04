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

This repo has been created as the public home for Dogfood Graph. Implementation
planning is tracked in F-Kanban.
