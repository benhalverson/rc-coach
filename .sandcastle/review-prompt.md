# TASK

Review only the changes for issue `{{TASK_ID}}` on branch `{{BRANCH}}`.

Do not merge the branch. Do not close the GitHub issue. Do not start another issue.

# CONTEXT

Read the issue and inspect the branch diff:

```bash
gh issue view {{TASK_ID}}
git diff {{SOURCE_BRANCH}}...{{BRANCH}}
git log {{SOURCE_BRANCH}}..{{BRANCH}} --oneline
```

# REVIEW FOCUS

Follow `AGENTS.md` and review for:

- Correctness against the issue goal and acceptance criteria.
- Regressions, edge cases, and missing tests.
- Consistency with Angular 21, Signals, TypeScript, Tailwind, pnpm, and local patterns.
- Small, maintainable implementation choices.
- Unrelated edits that should be removed before review.

# EXECUTION

If the branch is already good, make no changes.

If you find a small issue that is clearly within the same GitHub issue:

1. Edit only the relevant files.
2. Run the relevant commands from the issue body, or the smallest reasonable checks from
   `package.json`.
3. Commit the review fix on the same branch.

Do not broaden scope into a later issue. Mention follow-up work instead.

# FINISH

When complete, include:

- Review result.
- Any additional files changed.
- Commands run and their result.
- Any remaining risk or follow-up.

Then output:

```text
<promise>COMPLETE</promise>
```
