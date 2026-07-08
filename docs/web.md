# Marketing website (`apps/web`)

`apps/web` is the public marketing / waitlist website for Clarke Coach. It is a
static Next.js (App Router, TypeScript) site whose single landing page is
implemented from the Claude Design project **"Clarke Coach Mobile UI"**
(`Clarke Coach Landing.dc.html`). It has **no backend coupling**: nothing in
`apps/web` talks to the Django API, and nothing in `backend/` knows the site
exists.

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

- **Waitlist form** (`components/WaitlistForm.tsx`): validates and renders a
  success state, but the submit handler is a stub — it stores nothing and calls
  no API. The success message says so ("Demo form — submissions aren't stored
  yet.").
- Footer links **Privacy / Contact / Updates** point at `#` until those pages
  exist.

## Waitlist integration plan

When the waitlist goes live, the intended shape is:

1. A small `waitlist` Django app (or reuse of an email-capture service if we'd
   rather not store PII ourselves) exposing `POST /api/waitlist/` — unauthenticated,
   throttled, validating email + optional instrument/skill/role.
2. `WaitlistForm.tsx` swaps its stubbed handler (marked with a `TODO`) for a
   `fetch` POST to that endpoint; error/loading states are already in place.
3. CORS: the Django API would need to allow the site's origin for that one
   endpoint only. Everything else stays mobile-only.

Per `docs/security.md`, any new endpoint must be rate-limited and must not
weaken existing auth — the waitlist endpoint is deliberately separate from
`accounts`.

## Deployment notes (future public launch)

- The page is fully static (`next build` prerenders `/`), so any Node host or
  static-capable platform works: Vercel is the lowest-friction option; the
  Railway/Render hosts already under consideration for Django
  (see `architecture.md`) can serve it too.
- No environment variables are needed today. When the waitlist endpoint lands,
  add `NEXT_PUBLIC_API_URL` (public, bundled — never a secret).
- Before launch: add a real domain to `metadata.metadataBase`, an Open Graph
  image, `robots`/`sitemap` entries, and the Privacy page the footer links to.
