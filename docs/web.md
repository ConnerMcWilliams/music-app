# Marketing website (`apps/web`)

`apps/web` is the public marketing / waitlist website for Clarke Coach. It is a
static Next.js (App Router, TypeScript) site whose single landing page is
implemented from the Claude Design project **"Clarke Coach Mobile UI"**
(`Clarke Coach Landing.dc.html`). It has exactly **one backend touchpoint**:
the waitlist form POSTs to the Django API's `POST /api/waitlist/` (see
"Waitlist integration" below). Everything else is static.

## Running locally

```bash
pnpm web:install   # or: pnpm --dir apps/web install
pnpm web:dev       # http://localhost:3000
```

Checks (same trio CI runs):

```bash
pnpm web:lint
pnpm web:typecheck
pnpm web:build
```

## How it fits into the monorepo

Like `apps/mobile`, the site is a **self-contained package with its own
`pnpm-lock.yaml`** — the repo is not a pnpm workspace. The root `package.json`
only forwards convenience scripts (`web:*`, mirroring `mobile:*`). CI runs in
`.github/workflows/web-ci.yml` (lint → typecheck → build), path-filtered to
`apps/web/**` so mobile/backend changes don't trigger it.

Structure:

```
apps/web/
  app/          # App Router: layout (fonts/SEO metadata), page, globals.css, icon.svg
  components/   # One component + CSS Module per landing-page section, plus
                # shared primitives (CtaLink, IconTile, LogoMark, SectionHeading, icons)
```

Styling is CSS Modules with design tokens (palette, gradients, layout rhythm)
as CSS custom properties in `app/globals.css` — no styling/icon/animation
dependencies. Fonts (Cormorant Garamond + Hanken Grotesk, the same pair the
mobile app uses) are self-hosted at build time via `next/font/google`.

## Implemented now

- The full landing page: nav, hero with CSS phone mockup, credibility strip,
  problem section, how-it-works, features, founder story, waitlist form, FAQ,
  footer — visually matching the Claude Design page, responsive down to phone
  widths (single explicit breakpoint at 900px plus fluid `clamp()`/auto-fit
  grids, as in the design).
- Basic SEO metadata (title, description, Open Graph, theme color) and an SVG
  favicon (`app/icon.svg`).
- Accessible form labels, a real submit button, and role chips with
  `aria-pressed`.

## Placeholders (not yet integrated)

- Footer links **Privacy / Contact / Updates** point at `#` until those pages
  exist.

## Waitlist integration (live)

The waitlist form (`components/WaitlistForm.tsx`) POSTs to the Django API:

- **Endpoint**: `POST /api/waitlist/` (backend `waitlist` app) — unauthenticated
  and throttled per client IP (scope `waitlist`, env `THROTTLE_WAITLIST`,
  default `10/hour`). The trailing slash is required.
- **Request**: JSON `{"email", "instrument", "skill", "role"}` — email required
  (normalized to lowercase server-side), the rest optional free text.
- **Response**: always `201` with `{"email": "<normalized>"}` — including for
  duplicate signups, which are idempotent (one row per email, first-write-wins)
  and never confirm membership. Invalid/missing email → `400`.
- **API base URL**: `NEXT_PUBLIC_API_URL` (see `.env.example`), falling back to
  `http://localhost:8000` for local dev.
- **CORS**: the site's origin must be in the backend's `CORS_ALLOWED_ORIGINS`
  in production (dev allows all origins via the `DEBUG` default). Only this
  endpoint is meant for browser use; everything else stays mobile-only.
- **Reaching the signups**: rows are visible in Django admin under *Waitlist*,
  with an "Export selected signups to CSV" action for feeding any email tool.

Per `docs/security.md`, any new endpoint must be rate-limited and must not
weaken existing auth — the waitlist endpoint is deliberately separate from
`accounts` and grants nothing.

## Deployment notes (future public launch)

- The page is fully static (`next build` prerenders `/`), so any Node host or
  static-capable platform works: Vercel is the lowest-friction option; the
  Railway/Render hosts already under consideration for Django
  (see `architecture.md`) can serve it too.
- `NEXT_PUBLIC_API_URL` (public, bundled — never a secret) must be set in the
  deploy platform's **build** environment: it is inlined at `next build`, so a
  build without it bakes in the `http://localhost:8000` fallback and a value
  change requires a rebuild.
- Before launch: add a real domain to `metadata.metadataBase`, an Open Graph
  image, `robots`/`sitemap` entries, and the Privacy page the footer links to.
