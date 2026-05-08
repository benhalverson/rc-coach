You are working in the rc-coach Angular app.

Follow AGENTS.md exactly.

Task:
Refactor the RC setup form into smaller standalone Angular components.

Constraints:
- Use Angular standalone components.
- Prefer signals where appropriate.
- Use Tailwind utilities for layout.
- Do not add Angular Material unless already used in this feature.
- Keep public API/data contracts unchanged.
- Do not rewrite unrelated files.
- Run the relevant tests and typecheck.

Required checks:
- pnpm test
- pnpm typecheck
- pnpm build

When finished:
- Commit the changes.
- Include a concise summary of changed files.
- Include any tests that failed and why.
- Emit <promise>COMPLETE</promise>.
