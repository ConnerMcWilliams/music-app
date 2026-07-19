# Marketing website (`apps/web`)

`apps/web` is the public marketing / waitlist website for Clarke Coach. It is a
static Next.js (App Router, TypeScript) site whose landing page is
implemented from the Claude Design project **"Clarke Coach Mobile UI"**
(`Clarke Coach Landing.dc.html`), alongside standalone `/privacy`, `/contact`,
and `/updates` routes the footer links to. It has **three backend
touchpoints** — the waitlist form (`POST /api/waitlist/`), the contact form
(`POST /api/contact/`), and the updates feed (`GET /api/updates/`) — see
"Backend integration" below. Everything else is static.

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
  app/          # App Router: layout (fonts/SEO metadata), landing page,
                # /privacy, /contact, and /updates routes, globals.css, icon.svg
  components/   # One component + CSS Module per landing-page section, plus the
                # ContactForm, the UpdatesList (client-fetched /updates feed),
                # the LegalPageShell wrapping /privacy and /contact, and shared
                # primitives (CtaLink, IconTile, LogoMark, SectionHeading, icons)
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
- Standalone `/privacy` (privacy policy) and `/contact` (contact form) pages,
  each wrapped in the shared `LegalPageShell` (a minimal header linking home
  plus the shared footer). Both render their heading as the page `h1`.

## Footer links

- All three footer links now point to real pages — **Privacy**, **Contact**, and
  **Updates** (the client-fetched updates feed, formerly a `#` placeholder
  reserved for the newsletter). The redundant **FAQ** link was removed (the FAQ
  section sits directly above the footer).

## Backend integration (live)

Two forms POST to the Django API and the `/updates` page GETs from it;
everything else is static. The API base URL is `NEXT_PUBLIC_API_URL` (see
`.env.example`), falling back to `http://localhost:8000` for local dev. All
three endpoints are unauthenticated (the marketing site has no auth), throttled
per client IP, and require the trailing slash. In production the site's origin
must be in the backend's `CORS_ALLOWED_ORIGINS` (dev allows all origins via the
`DEBUG` default); only these three endpoints are meant for browser use —
everything else stays mobile-only (or admin-only, see `docs/admin.md`). Per
`docs/security.md`, all are deliberately separate from `accounts` and grant
nothing.

### Waitlist form

The waitlist form (`components/WaitlistForm.tsx`):

- **Endpoint**: `POST /api/waitlist/` (backend `waitlist` app) — throttled per
  client IP (scope `waitlist`, env `THROTTLE_WAITLIST`, default `10/hour`).
- **Request**: JSON `{"email", "instrument", "skill", "role"}` — email required
  (normalized to lowercase server-side), the rest optional free text.
- **Response**: always `201` with `{"email": "<normalized>"}` — including for
  duplicate signups, which are idempotent (one row per email, first-write-wins)
  and never confirm membership. Invalid/missing email → `400`.
- **Reaching the signups**: rows are visible in Django admin under *Waitlist*,
  with an "Export selected signups to CSV" action for feeding any email tool.

### Contact form

The contact form (`components/ContactForm.tsx`) on the `/contact` page:

- **Endpoint**: `POST /api/contact/` (backend `contact` app) — throttled per
  client IP (scope `contact`, env `THROTTLE_CONTACT`, default `10/hour`).
- **Request**: JSON `{"name", "email", "message"}` — all required; email is
  normalized to lowercase server-side.
- **Response**: `201` with `{"name", "email"}` on success; invalid/missing
  fields → `400`. Unlike waitlist, submissions are **not** idempotent — each
  POST stores a new message.
- **Delivery**: every message is persisted and a notification email is sent to
  the site owner (`CONTACT_NOTIFICATION_EMAIL`), with the submitter set as the
  `Reply-To`. Email is best-effort — a mail outage never fails the request.
  Configure SMTP via the `EMAIL_*` vars in `backend/.env.example`; in `DEBUG`
  the message prints to the dev console instead.
- **Reaching the messages**: rows are visible in Django admin under *Contact*,
  with an "Export selected messages to CSV" action.

### Updates feed

The `/updates` page (`components/UpdatesList.tsx`) fetches posts client-side:

- **Endpoint**: `GET /api/updates/` (backend `updates` app) — throttled per
  client IP (scope `updates_public`, env `THROTTLE_UPDATES_PUBLIC`, default
  `120/hour`). Returns only **published** posts, newest first, in DRF's
  paginated envelope (the page reads `.results`).
- **Publishing**: posts are written and published from the admin dashboard
  (`apps/admin`, see `docs/admin.md`). Because the fetch happens in the
  browser, a newly published post appears with **no site redeploy**.

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
  image, and `robots`/`sitemap` entries.
