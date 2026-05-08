// Sequential issue runner with reviewer
//
// `pnpm run agent` processes exactly one GitHub issue:
//   1. Select the lowest-numbered open issue labeled `mvp-stabilization`.
//   2. If no such issue exists, select the lowest-numbered open issue that
//      looks related to Track Editor MVP stabilization.
//   3. Create/use branch `sandcastle/issue-{number}-{slug}`.
//   4. Run the implementer.
//   5. If the implementer produced commits, run the reviewer on the same
//      branch and stop.
//
// There is no planner loop, parallel implementation, merge phase, or automatic
// issue closing in this workflow.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type GhIssue = {
  number: number;
  title: string;
  body?: string;
  labels?: { name: string }[];
};

type SelectedIssue = {
  issue: GhIssue;
  branch: string;
  reason: string;
};

const TRACK_EDITOR_TERMS = [
  "track editor",
  "mvp",
  "stabil",
  "opencv",
  "quad",
  "scale",
  "annotation",
  "zone",
  "centerline",
  "export",
  "import",
  "viewer",
  "mobile",
];

// Hooks run inside the sandbox before the agent starts each iteration.
const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command: [
          "if [ -d /tmp/gh-host ]; then mkdir -p /home/agent/.config && rm -rf /home/agent/.config/gh && cp -R /tmp/gh-host /home/agent/.config/gh && chmod -R u+rwX /home/agent/.config/gh; fi",
          "if [ -d /tmp/codex-host ]; then rm -rf /home/agent/.codex && cp -R /tmp/codex-host /home/agent/.codex && chmod -R u+rwX /home/agent/.codex; fi",
          "corepack prepare pnpm@10.23.0 --activate",
          "corepack pnpm --version",
          "CI=true corepack pnpm install --frozen-lockfile",
        ].join(" && "),
        timeoutMs: 300_000,
      },
    ],
  },
};

// Copy node_modules from the host into the worktree before the sandbox starts.
const copyToWorktree = ["node_modules"];

function readLocalEnv(): Record<string, string> {
  const path = join(process.cwd(), ".sandcastle", ".env");
  if (!existsSync(path)) return {};

  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value) vars[key] = value;
  }

  return vars;
}

function execText(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ghAuthToken(): string | undefined {
  try {
    return execText("gh", ["auth", "token"]);
  } catch {
    return undefined;
  }
}

function hasHostGhAuth(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function currentGitBranch(): string {
  return execText("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

function listOpenIssues(label?: string): GhIssue[] {
  const args = ["issue", "list", "--state", "open"];
  if (label) args.push("--label", label);
  args.push("--limit", "1000", "--json", "number,title,body,labels");

  const raw = execText("gh", args);
  const issues = JSON.parse(raw) as GhIssue[];
  return [...issues].sort((a, b) => a.number - b.number);
}

function labelNames(issue: GhIssue): string[] {
  return issue.labels?.map((label) => label.name.toLowerCase()) ?? [];
}

function isTrackEditorStabilizationIssue(issue: GhIssue): boolean {
  const labels = labelNames(issue);
  if (
    labels.includes("mvp-stabilization") ||
    labels.includes("track-editor") ||
    labels.includes("opencv") ||
    labels.includes("geometry") ||
    labels.includes("ux")
  ) {
    return true;
  }

  const haystack = [
    issue.title,
    issue.body ?? "",
    ...labels,
  ]
    .join(" ")
    .toLowerCase();

  const hasTrackEditorSignal =
    haystack.includes("track editor") ||
    haystack.includes("top-down") ||
    haystack.includes("topdown") ||
    haystack.includes("rc coach");
  const hasStabilizationSignal = TRACK_EDITOR_TERMS.some((term) =>
    haystack.includes(term),
  );

  return hasTrackEditorSignal && hasStabilizationSignal;
}

function slugify(value: string): string {
  const slug = value
    .replace(/^issue\s+\d+\s*:\s*/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "track-editor-mvp";
}

function selectIssue(): SelectedIssue {
  let labeled: GhIssue[] = [];
  try {
    labeled = listOpenIssues("mvp-stabilization");
  } catch (error) {
    console.warn(
      "Could not list issues by `mvp-stabilization` label; using fallback issue selection.",
    );
    if (error instanceof Error && error.message) {
      console.warn(error.message);
    }
  }

  const issue =
    labeled[0] ??
    listOpenIssues().find((candidate) =>
      isTrackEditorStabilizationIssue(candidate),
    );

  if (!issue) {
    throw new Error(
      [
        "No open issue selected.",
        "Expected either an open issue labeled `mvp-stabilization` or an open Track Editor MVP stabilization issue.",
      ].join("\n"),
    );
  }

  const reason =
    labeled.length > 0
      ? "lowest-numbered open issue labeled `mvp-stabilization`"
      : "lowest-numbered open issue matching Track Editor MVP stabilization fallback";

  return {
    issue,
    branch: `sandcastle/issue-${issue.number}-${slugify(issue.title)}`,
    reason,
  };
}

const localEnv = readLocalEnv();
const OPENAI_KEY =
  localEnv.OPENAI_KEY ||
  localEnv.OPENAI_API_KEY ||
  process.env.OPENAI_KEY ||
  process.env.OPENAI_API_KEY;
const GH_TOKEN = localEnv.GH_TOKEN || process.env.GH_TOKEN || ghAuthToken();
const hostGhConfigDir = process.env.HOME
  ? join(process.env.HOME, ".config", "gh")
  : undefined;
const hostCodexConfigDir = process.env.HOME
  ? join(process.env.HOME, ".codex")
  : undefined;
const useHostGhConfig =
  !GH_TOKEN && !!hostGhConfigDir && existsSync(hostGhConfigDir) && hasHostGhAuth();
const useHostCodexConfig =
  !OPENAI_KEY &&
  !!hostCodexConfigDir &&
  existsSync(join(hostCodexConfigDir, "auth.json"));

const missing = [
  !OPENAI_KEY && !useHostCodexConfig
    ? "OPENAI_KEY, OPENAI_API_KEY, or host Codex login"
    : null,
  !GH_TOKEN && !useHostGhConfig ? "GH_TOKEN or host gh auth" : null,
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(
    [
      `Missing Sandcastle credential(s): ${missing.join(", ")}`,
      "Set them in .sandcastle/.env or export them before running pnpm run agent.",
      "Alternatively, run codex login on the host so Sandcastle can copy the Codex auth into Docker.",
      "Alternatively, run gh auth login on the host so Sandcastle can mount the GitHub CLI config.",
    ].join("\n"),
  );
}

const sandcastleEnv = {
  ...(OPENAI_KEY ? { OPENAI_KEY, OPENAI_API_KEY: OPENAI_KEY } : {}),
  ...(GH_TOKEN ? { GH_TOKEN } : {}),
} as Record<string, string>;

const agent = () => sandcastle.codex("gpt-5.4-mini");
const sandboxProvider = () =>
  docker({
    imageName: "sandcastle:rc-coach",
    env: sandcastleEnv,
    mounts: [
      ...(useHostGhConfig
        ? [
            {
              hostPath: hostGhConfigDir!,
              sandboxPath: "/tmp/gh-host",
              readonly: true,
            },
          ]
        : []),
      ...(useHostCodexConfig
        ? [
            {
              hostPath: hostCodexConfigDir!,
              sandboxPath: "/tmp/codex-host",
              readonly: true,
            },
          ]
        : []),
    ],
  });

const selected = selectIssue();
const sourceBranch = currentGitBranch();

console.log("\n=== Sandcastle sequential reviewer ===\n");
console.log(`Issue: #${selected.issue.number} ${selected.issue.title}`);
console.log(`Selection: ${selected.reason}`);
console.log(`Branch: ${selected.branch}`);
console.log(`Source branch: ${sourceBranch}`);
console.log("\nNo planner, parallel execution, merge phase, or auto-close will run.\n");

const sandbox = await sandcastle.createSandbox({
  branch: selected.branch,
  sandbox: sandboxProvider(),
  hooks,
  copyToWorktree,
});

let implementCommits = 0;
let reviewCommits = 0;
let reviewerRan = false;

try {
  const implement = await sandbox.run({
    name: "implementer",
    maxIterations: 100,
    agent: agent(),
    promptFile: "./.sandcastle/implement-prompt.md",
    promptArgs: {
      TASK_ID: String(selected.issue.number),
      ISSUE_TITLE: selected.issue.title,
      BRANCH: selected.branch,
      SOURCE_BRANCH: sourceBranch,
    },
  });

  implementCommits = implement.commits.length;

  if (implementCommits > 0) {
    reviewerRan = true;
    const review = await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      agent: agent(),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        TASK_ID: String(selected.issue.number),
        ISSUE_TITLE: selected.issue.title,
        BRANCH: selected.branch,
        SOURCE_BRANCH: sourceBranch,
      },
    });

    reviewCommits = review.commits.length;
  }
} finally {
  await sandbox.close();
}

console.log("\n=== Sandcastle summary ===\n");
console.log(`Issue: #${selected.issue.number} ${selected.issue.title}`);
console.log(`Branch: ${selected.branch}`);
console.log(`Implementer commits: ${implementCommits}`);
console.log(
  `Reviewer: ${
    reviewerRan
      ? `ran on the same branch (${reviewCommits} commit${reviewCommits === 1 ? "" : "s"})`
      : "skipped because the implementer produced no commits"
  }`,
);
console.log("Merge phase: not run");
console.log("Issue closing: not run");
console.log("\nDone.");
