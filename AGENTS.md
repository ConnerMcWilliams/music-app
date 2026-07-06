# Agent Instructions

## Project type
This is a long-term music app (Expo mobile + Django API) built as a monorepo.

## Required reading (before touching API/auth/submission code)
- `docs/api.md` — endpoints, submission contract, mobile integration rules
- `docs/security.md` — what must never be weakened
- `docs/troubleshooting.md` — dev networking; read BEFORE "fixing" an
  unreachable-backend symptom by changing auth, CORS, or permissions

## API integration guardrails
- The API base URL is defined once: `apps/mobile/src/services/api.ts`
  (`EXPO_PUBLIC_API_URL` override → Metro-derived host → localhost). Never
  hard-code hosts or endpoint strings elsewhere.
- Auth is attached in one place: `authClient.authedRequest`. Screens never
  read tokens.
- Django routes end in a trailing slash; POSTs without it fail (no redirect).
- "Browser shows JSON but the app can't connect" is a networking/setup issue
  (server bound to 127.0.0.1, WSL2 NAT, tunnel mode, stale
  `EXPO_PUBLIC_API_URL`) — not a reason to loosen permissions or CORS.
- `POST /api/submissions/` requires auth and takes multipart form data; the
  submitter always comes from the token, never from a payload field.

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