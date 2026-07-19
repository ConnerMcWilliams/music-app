# Admin dashboard (`apps/admin`)

`apps/admin` is the **internal, owner-only** dashboard for Clarke Coach: signup
analytics, newsletter sending, and publishing posts to the website's `/updates`
page. It is a static Next.js (App Router, TypeScript) app in the same style as
`apps/web` (same design tokens, CSS Modules, self-contained package with its
own `pnpm-lock.yaml`). It is a personal tool — functional over polished — and
is **not** linked from any public surface.

## Running locally

```bash
pnpm admin:install   # or: pnpm --dir apps/admin install
pnpm admin:dev       # http://localhost:3100 (web owns 3000)
```

Checks (same trio CI runs, `.github/workflows/admin-ci.yml`):

```bash
pnpm admin:lint
pnpm admin:typecheck
pnpm admin:build
```

The backend must be running (`uv run manage.py runserver` in `backend/`) and
you need a **staff** account — create one with
`uv run manage.py createsuperuser`. In production the dashboard's origin must
be added to the backend's `CORS_ALLOWED_ORIGINS`, and `NEXT_PUBLIC_API_URL`
must be set in the **build** environment (inlined at `next build`, same rule as
`apps/web`).

## Auth model

The dashboard signs in with the existing JWT endpoints (`POST
/api/auth/login/`; refresh with rotation via `POST /api/auth/refresh/`). Every
admin API endpoint is gated with DRF's `IsAdminUser`, i.e. `User.is_staff` —
a normal app account authenticates fine but gets `403` ("This account has no
admin access"). Tokens live in `localStorage` (`lib/api.ts`) — an accepted
XSS trade-off for a single-owner internal tool. All requests go through the
one client in `lib/api.ts`; it re-tries once after refreshing on a `401` and
always persists the rotated refresh token.

## Pages

- **`/` (dashboard)** — stat cards (registered members, waitlist total,
  subscribed, unique visitors, and conversion rate; premium members and ad
  revenue are placeholders for later), a visitors-per-day / signups-per-day bar
  chart pair, a per-traffic-source conversion table, breakdowns of the free-text
  waitlist fields (role/instrument/skill, case-folded server-side), and a
  filterable paginated waitlist browser. Conversion rate is signups ÷ unique
  visitors over the `?days` window (reads "—" until visits are tracked).
  "Educator" style questions = filtering `role` (the public form offers
  Student/Teacher/Parent, but the field is free text).
- **`/newsletter`** — compose (plain text) and send to every **subscribed**
  waitlist signup, with an explicit confirm step; send history below. Each
  email gets a personalized one-click unsubscribe link appended. In `DEBUG`
  the emails print to the backend console; real sending needs the `EMAIL_*`
  SMTP vars (`backend/.env.example`).
- **`/updates`** — create/edit/publish/delete update posts. Published posts
  appear on the website's `/updates` page immediately (the site fetches
  client-side — no redeploy).

## Backend endpoints (admin ↔ Django contract)

All staff-gated with `IsAdminUser` unless noted. Trailing slash required.

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/api/dashboard/analytics/` | staff | Member count + waitlist totals/breakdowns/day series + `conversion` block (unique visitors, pageviews, signups, rate, visitors-by-day, per-source) (`?days=`, default 90, max 365) |
| GET | `/api/dashboard/waitlist/` | staff | Paginated signups; filters `role`/`instrument`/`skill`/`q`/`subscribed` |
| GET | `/api/dashboard/newsletters/` | staff | Send history (paginated, newest first) |
| POST | `/api/dashboard/newsletters/` | staff | `{subject, body}` → persist, send synchronously, `201` with counts |
| GET | `/api/updates/manage/` | staff | All posts incl. drafts |
| POST | `/api/updates/manage/` | staff | Create post (`published` defaults false) |
| GET/PATCH/DELETE | `/api/updates/manage/<pk>/` | staff | Read/edit/delete one post |
| GET | `/api/updates/` | public | Published posts (throttle `updates_public`) — consumed by `apps/web` |
| GET | `/api/waitlist/unsubscribe/?token=` | public | One-click opt-out (signed token; throttle `unsubscribe`) |

Backend code: `backend/dashboard/` (analytics, newsletter model + send loop in
`emails.py`), `backend/updates/` (posts), `backend/waitlist/`
(`subscribed` flag + `tokens.py` signed unsubscribe tokens), and
`backend/analytics/` (the `PageVisit` model behind the conversion block; the
per-source join reuses the shared `config/attribution.py` normalization so a
visit and the signup it produces bucket into the same channel).

## Newsletter mechanics & limits

- Recipients are `WaitlistSignup.objects.filter(subscribed=True)`; one email
  per recipient on a shared SMTP connection (personalized unsubscribe link, no
  shared `To:`). Per-recipient failures are logged and counted, never abort
  the batch (`failed_count` on the send record).
- The send is **synchronous inside the request** — fine at the current scale.
  Past a few hundred recipients, move the `send_newsletter()` call into a
  management command (it is a plain function for exactly that reason), and
  mind Gmail-class SMTP daily caps (~500).
- Unsubscribe tokens are stateless (`django.core.signing`, salt
  `waitlist.unsubscribe`, no expiry). Rotating `SECRET_KEY` invalidates every
  link already sent. `BACKEND_BASE_URL` must be the backend's public origin in
  production or emailed links point at localhost. One-click GET unsubscribe
  means mail-scanner prefetch can opt someone out — accepted at this scale.
- Resubscribing is manual: flip `subscribed` in Django admin (*Waitlist*).
