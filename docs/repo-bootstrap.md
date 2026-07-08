# EdgeVector Repo Bootstrap

Use this runbook when creating and seeding a new public EdgeVector repository.
It avoids three failure modes from the initial Dogfood Graph bootstrap:
string booleans passed to `gh api`, connector writes that 403 on newly-created
repositories, and tokenized HTTPS remotes appearing in Git command output.

## Create The Repository

Use typed fields with `gh api`. Do not use `-f private=false`; `-f` sends a
string value and can create the repository as private.

```sh
gh api orgs/EdgeVector/repos \
  -X POST \
  -f name=dogfood-graph \
  -f description="LastDB-native app for manual product dogfooding" \
  -F private=false \
  -F has_issues=true \
  -F has_projects=false \
  -F has_wiki=false
```

Immediately verify public visibility before writing contents:

```sh
gh repo view EdgeVector/dogfood-graph \
  --json isPrivate,visibility \
  --jq 'select(.isPrivate == false and .visibility == "PUBLIC")'
```

The expected state is `private:false` and `visibility:public` in GitHub's API
model. If either check fails, patch the repository visibility before continuing:

```sh
gh api repos/EdgeVector/dogfood-graph \
  -X PATCH \
  -F private=false \
  -f visibility=public
```

## Seed Initial Contents

Prefer Git for initial seeding. A newly-created organization repository may not
be immediately writable through a GitHub App connector, or the connector
installation may not include the new repository yet. In that case connector file
creation can fail with `Resource not accessible by integration` even though the
agent can push through normal Git credentials.

Safe bootstrap path:

```sh
gh auth setup-git --hostname github.com
gh repo clone EdgeVector/dogfood-graph /tmp/dogfood-graph-bootstrap
cd /tmp/dogfood-graph-bootstrap
git config remote.origin.url https://github.com/EdgeVector/dogfood-graph.git
git config --get remote.origin.url
```

The final command must print the canonical GitHub URL without userinfo or token
material. Do not run `git remote -v` after authenticated HTTPS clones; it prints
both fetch and push URLs and can expose a tokenized rewrite from local Git
configuration.

After committing the initial files:

```sh
git push -u origin HEAD
```

If the connector must seed files, first confirm its installation can see and
write the repository. On a 403, stop connector writes for that repo, seed through
Git, and refresh or expand the connector installation before retrying connector
contents APIs.

## Credential Hygiene

GitHub credentials should live in the GitHub CLI credential helper, not in
remote URLs or global URL rewrites.

Before leaving a checkout behind, verify the local repo config:

```sh
git config --get remote.origin.url
```

The value should be one of:

```text
https://github.com/EdgeVector/dogfood-graph.git
git@github.com:EdgeVector/dogfood-graph.git
```

Also check for tokenized global rewrites without printing their values in logs:

```sh
git config --global --get-regexp '^url\..*\.insteadOf$'
```

If an entry embeds `x-access-token`, `ghp_`, `github_pat_`, or userinfo before
`github.com`, remove that rewrite and run:

```sh
gh auth setup-git --hostname github.com
```

Temporary bootstrap checkouts should be deleted after their PR lands or after
their contents are pushed. Never commit `.git/config`, shell history, or command
logs containing credential-bearing URLs.
