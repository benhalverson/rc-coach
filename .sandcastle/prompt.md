# Track Editor MVP Sequential Issue Workflow

This repository uses `pnpm run agent` to process exactly one GitHub issue at a time.

The runner in `.sandcastle/main.mts` selects the lowest-numbered open issue labeled
`mvp-stabilization`. If no issue has that label, it falls back to the lowest-numbered
open issue that appears related to Track Editor MVP stabilization.

For the selected issue, Sandcastle creates or reuses:

```text
sandcastle/issue-{number}-{slug}
```

Then it runs:

1. The implementer prompt for that single issue.
2. The reviewer prompt on the same branch, only if the implementer produced commits.

This workflow does not run a planner, does not process issues in parallel, does not
merge branches, and does not close GitHub issues automatically.
