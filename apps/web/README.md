# Clarke Coach — marketing website

Public marketing / waitlist site for Clarke Coach (Next.js App Router, TypeScript,
CSS Modules). The landing page is implemented from the Claude Design project
"Clarke Coach Mobile UI" (`Clarke Coach Landing.dc.html`), with standalone
`/privacy`, `/contact`, and `/updates` pages. The waitlist and contact forms post
to the Django API, the `/updates` page fetches from it, and a page-visit beacon
posts anonymous conversion analytics (`POST /api/waitlist/`, `POST /api/contact/`,
`GET /api/updates/`, `POST /api/site/visit/`; API base URL via
`NEXT_PUBLIC_API_URL`, canonical origin for SEO via `NEXT_PUBLIC_SITE_URL`; see
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

Full documentation (monorepo fit, placeholders, backend integration,
deployment notes): [`docs/web.md`](../../docs/web.md).
