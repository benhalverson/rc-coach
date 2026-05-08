# AGENTS.md

## Project

This repository is `rc-coach`, an Angular 21 application for RC racing setup/coaching workflows.

The app should stay simple, fast, mobile-friendly, and maintainable. It is built with Angular, TypeScript, Tailwind CSS v4, pnpm, and Cloudflare tooling.

## Default rules

- Use `pnpm`, not npm or yarn.
- Do not rewrite unrelated files.
- Prefer small, focused changes over large rewrites.
- Preserve existing public APIs, DTOs, route contracts, and data shapes unless explicitly told otherwise.
- Keep implementation choices boring and maintainable.
- Do not add new dependencies unless there is a clear reason.
- Do not invent backend routes, data fields, or product behavior.
- When uncertain, inspect the existing code and follow the local pattern.

## Stack

- Angular 21
- TypeScript
- Tailwind CSS v4
- `@tailwindcss/postcss`
- Angular SSR / Cloudflare deployment path
- pnpm `10.23.0`
- Vitest is available for tests
- Wrangler is used for preview/deploy/type generation

## Commands

Use these commands from the repo root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm cf-typegen
