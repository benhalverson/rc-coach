# Unused Legacy Planner Prompt

`pnpm run agent` no longer runs a planner prompt.

Issue selection now lives in `.sandcastle/main.mts` and deliberately chooses exactly
one issue per run:

1. Lowest-numbered open issue labeled `mvp-stabilization`.
2. If that label is absent from all open issues, the lowest-numbered open issue that
   appears related to Track Editor MVP stabilization.

This file is retained only as a note for older Sandcastle templates. It should not be
used for the RC Coach Track Editor MVP sequential-reviewer workflow.
