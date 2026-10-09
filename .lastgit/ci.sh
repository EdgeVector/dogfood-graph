#!/usr/bin/env bash
set -euo pipefail

npm ci
npm run lint
npm run typecheck
npm run build
npm run verify:repo-bootstrap
