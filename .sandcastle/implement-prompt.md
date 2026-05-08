# TASK

Implement exactly one GitHub issue:

```text
#{{TASK_ID}} {{ISSUE_TITLE}}
```

You are already working on branch `{{BRANCH}}`. Do not switch to another feature
branch unless you are repairing this same branch.

# REQUIRED CONTEXT

Read the issue before editing:

```bash
gh issue view {{TASK_ID}}
```

Follow `AGENTS.md` exactly. Use `pnpm`, preserve public APIs and data shapes unless the
issue explicitly says otherwise, and keep changes small enough for a sequential review.

# SCOPE

- Implement only issue `{{TASK_ID}}`.
- Do not implement follow-up issues.
- Do not modify unrelated files.
- Do not merge branches.
- Do not close the GitHub issue.
- Do not change product behavior beyond what the issue requests.

If the issue reveals broader architecture work, stop at the smallest safe change and
leave a concise issue comment describing the blocker or follow-up.

# EXPLORATION

Before editing, inspect the relevant source, tests, scripts, and docs. Prefer `rg` and
the existing repo patterns. Pay special attention to files and commands listed in the
issue body.

# IMPLEMENTATION

For code changes, prefer a tight red/green loop when practical:

1. Add or update the smallest relevant test.
2. Implement the minimal change.
3. Repeat until the issue acceptance criteria are met.
4. Refactor only within the changed area if it improves maintainability.

Documentation-only issues do not require new product tests unless the issue asks for
them.

# VERIFICATION

Run the commands listed in the issue body when present. If the issue has no command
section, inspect `package.json` and run the smallest reasonable repo checks, usually:

```bash
pnpm test
pnpm build
```

If a listed command is unavailable, do not invent dependencies. Document the blocker in
the final response and, if useful, in an issue comment.

# COMMIT

Commit only the files related to issue `{{TASK_ID}}`.

Use a concise commit message:

```text
Sandcastle issue {{TASK_ID}}: <short summary>
```

# FINISH

Do not close the issue. Do not merge the branch.

When complete, include:

- Summary of changes.
- Files changed.
- Commands run and their result.
- Any follow-up that should be handled in a later issue.

Then output:

```text
<promise>COMPLETE</promise>
```
