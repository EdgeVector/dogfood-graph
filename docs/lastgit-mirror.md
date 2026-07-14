# LastGit Canonical Repository

Dogfood Graph is canonical on LastGit:

```text
lastdb:///dogfood-graph
```

GitHub `EdgeVector/dogfood-graph` is retained as the public read-only mirror.
Review artifacts should be LastGit change requests, gated by `.lastgit/ci.sh`
with required status `ci-required`.

## Local Routing

The committed `.last-stack/pr-venue` file makes Last Stack route this repository
to LastGit. A local checkout should also have the LastGit remote:

```sh
git remote add lastgit lastdb:///dogfood-graph
git fetch lastgit main
```

## Mirror Policy

The mirror must fast-forward from LastGit `main`; it must not be used as the
source of truth for pull requests or branch protection decisions. The supervised
LastGit shadow runner can sync the mirror by setting:

```sh
LASTGIT_MIRROR_CLONE=/Users/tomtang/code/edgevector/dogfood-graph
```

The mirror clone must stay clean and fast-forwardable. Do not force-push the
mirror.

## Proof

Migration is complete when these match:

```sh
git ls-remote lastgit refs/heads/main
git ls-remote origin refs/heads/main
```

The LastGit CI status for the merge commit must be `ci-required=success`.
