import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const tokenPattern = /(?:x-access-token|ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|https:\/\/[^/\s]+@github\.com)/i;

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.optional) {
      return "";
    }
    throw error;
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const originUrl = git(["config", "--get", "remote.origin.url"], { optional: true });
if (tokenPattern.test(originUrl)) {
  fail("remote.origin.url contains an embedded GitHub credential; replace it with https://github.com/EdgeVector/dogfood-graph.git");
}

const globalRewrites = git(["config", "--global", "--get-regexp", "^url\\..*\\.insteadOf$"], {
  optional: true,
});
if (tokenPattern.test(globalRewrites)) {
  fail("global git url.*.insteadOf contains an embedded GitHub credential; remove the rewrite and use gh auth setup-git");
}

const guidePath = join(repoRoot, "docs", "repo-bootstrap.md");
if (!existsSync(guidePath)) {
  fail("docs/repo-bootstrap.md is missing");
} else {
  const guide = readFileSync(guidePath, "utf8");
  const requiredSnippets = [
    "gh api orgs/EdgeVector/repos",
    "-F private=false",
    "visibility:public",
    "gh auth setup-git",
    "gh repo clone",
    "git remote -v",
    "Resource not accessible by integration",
  ];

  for (const snippet of requiredSnippets) {
    if (!guide.includes(snippet)) {
      fail(`docs/repo-bootstrap.md is missing required guidance: ${snippet}`);
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("repo bootstrap guidance verified");
