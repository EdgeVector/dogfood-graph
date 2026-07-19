# Vendored `@lastdb/app-sdk`

This directory is a dist-only vendored package built from
`EdgeVector/fold:lastdb_app_sdk` at commit
`3552c6501e227f67cdf0021d5f6ef252c7a7ce8a`.

Refresh rule:

1. Build `lastdb_app_sdk` in a clean `fold` checkout.
2. Copy only `dist/`, `README.md`, `LICENSE`, and runtime `package.json`
   metadata here. Strip source-only SDK development fields such as
   `scripts`, `devDependencies`, and `publishConfig`.
3. Run `npm install --package-lock-only` in `dogfood-graph` so
   `package-lock.json` records the vendored package version.

Do not hand-edit generated files under `dist/`. Source docs such as
`CONTRACT.md` remain in the upstream SDK package and are intentionally not part
of this vendored runtime copy.
