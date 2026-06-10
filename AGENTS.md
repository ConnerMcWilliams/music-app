# Agent Instructions

## Project type
This is a long-term music web app built as a monorepo.

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`
- Build: `pnpm build`

## Rules
- Do not push to `main`.
- Do not create large rewrites without approval.
- Do not add dependencies without asking and explaining why.
- Do not change auth, payments, database schema, or permissions without tests.
- Keep changes scoped to the GitHub issue.
- Prefer existing components and patterns.
- Use TypeScript strictly.
- Validate all external input.
- Add loading, empty, and error states for user-facing UI.
- Update docs when changing architecture.

## Sensitive areas
- environment variable handling
- payment or subscription logic