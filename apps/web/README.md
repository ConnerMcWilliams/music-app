# Clarke Coach — marketing website

Public marketing / waitlist site for Clarke Coach (Next.js App Router, TypeScript,
CSS Modules). The landing page is implemented from the Claude Design project
"Clarke Coach Mobile UI" (`Clarke Coach Landing.dc.html`). The waitlist form posts
to the Django API's `POST /api/waitlist/` (base URL via `NEXT_PUBLIC_API_URL`; see
`.env.example`).

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Or from the repo root: `pnpm web:dev`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Full documentation (monorepo fit, placeholders, waitlist integration,
deployment notes): [`docs/web.md`](../../docs/web.md).
