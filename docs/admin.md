# Admin dashboard (`apps/admin`)

`apps/admin` is the **internal, owner-only** dashboard for Clarke Coach: signup
analytics, newsletter sending, publishing posts to the website's `/updates`
page, and editing the mobile onboarding flow (plus A/B testing it). It is a
static Next.js (App Router, TypeScript) app in the same style as
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

## Error & loading states

Standard Next.js App Router conventions surface failures calmly: `app/error.tsx`
(route error boundary) and `app/not-found.tsx` (404) share the `AdminMessage`
block for copy, `app/global-error.tsx` (root-layout failure) is self-contained
(own `<html>/<body>`, inline styles), and `app/loading.tsx` is the
route-transition fallback. Authorization is handled in-flow:
an unauthenticated load redirects to `/login`, and a non-staff `403` shows "This
account has no admin access" — the real gate is the backend `IsAdminUser`. See
[`docs/error-handling.md`](error-handling.md).

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
  the emails print to the backend console; real sending goes through Resend's
  HTTPS API and needs `RESEND_API_KEY` (`backend/.env.example`).
- **`/updates`** — create/edit/publish/delete update posts. Published posts
  appear on the website's `/updates` page immediately (the site fetches
  client-side — no redeploy).
- **`/config`** — the hub for anything editable without shipping an app build.
  Today that is the mobile onboarding flow: a list of *variants* (edit,
  duplicate, make default, archive, delete) plus the A/B experiments run over
  them, each with its funnel table inline. `/config/<key>` is the variant
  editor. See *Onboarding config & A/B* below.

## Backend endpoints (admin ↔ Django contract)

All staff-gated with `IsAdminUser` unless noted. Trailing slash required. Every
admin response carries `Cache-Control: no-store` (`config.mixins.NoStoreMixin`)
so subscriber and analytics data is never cached, and unauthorized (`401`/`403`)
hits are logged server-side (see [`docs/security.md`](security.md)).

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
| GET | `/api/features/onboarding/catalog/` | staff | The editable-surface schema the variant editor renders itself from |
| GET/POST | `/api/features/onboarding/variants/` | staff | List / create onboarding flows |
| GET/PATCH/DELETE | `/api/features/onboarding/variants/<key>/` | staff | Edit one flow (`is_default` is read-only here) |
| POST | `/api/features/onboarding/variants/<key>/duplicate/` | staff | `{key, name}` → a copy, for building an experiment arm |
| POST | `/api/features/onboarding/variants/<key>/default/` | staff | Promote to default, demoting the incumbent |
| GET/POST | `/api/features/experiments/` | staff | List / create experiments (arms written inline) |
| GET/PATCH/DELETE | `/api/features/experiments/<key>/` | staff | Edit; start/stop via `status` |
| GET | `/api/features/experiments/<key>/results/` | staff | Per-arm funnel: started, step drop-off, completed, activated |
| GET | `/api/onboarding/config/` | user | The mobile app's flow (throttle `onboarding_config`) |
| POST | `/api/onboarding/views/` | user | Funnel beacon → 204 (throttle `onboarding_views`) |

Backend code: `backend/features/` (onboarding variants, experiments, assignment,
funnel metrics), `backend/dashboard/` (analytics, newsletter model + send loop in
`emails.py`), `backend/updates/` (posts), `backend/waitlist/`
(`subscribed` flag + `tokens.py` signed unsubscribe tokens), and
`backend/analytics/` (the `PageVisit` model behind the conversion block; the
per-source join reuses the shared `config/attribution.py` normalization so a
visit and the signup it produces bucket into the same channel).

## Newsletter mechanics & limits

- Recipients are `WaitlistSignup.objects.filter(subscribed=True)`; one email
  per recipient — each `send()` a separate Resend HTTPS API call, reusing one
  HTTP session (personalized unsubscribe link, no shared `To:`). Per-recipient
  failures — a raised exception, or a `send()` that
  returns `0` (the backend accepted nothing without raising) — are logged and
  counted, never abort the batch (`failed_count` on the send record).
- The send is **synchronous inside the request** — fine at the current scale.
  Past a few hundred recipients, move the `send_newsletter()` call into a
  management command (it is a plain function for exactly that reason), and
  mind Resend's API rate limits.
- Unsubscribe tokens are stateless (`django.core.signing`, salt
  `waitlist.unsubscribe`, no expiry). Rotating `SECRET_KEY` invalidates every
  link already sent. `BACKEND_BASE_URL` must be the backend's public origin in
  production or emailed links point at localhost. One-click GET unsubscribe
  means mail-scanner prefetch can opt someone out — accepted at this scale.
- Resubscribing is manual: flip `subscribed` in Django admin (*Waitlist*).

## Onboarding config & A/B

The mobile onboarding flow is a hard gate — six screens every account must clear
before the tabs — and it used to be compiled into the app bundle, so rewording a
question meant a store release. It is now data.

### What is editable, and what is not

A **variant** is one complete flow. Per step you can change the title, subtitle,
button label and any step-specific copy; drop or reorder options; and turn the
step off entirely. What you cannot do is invent a question: every answer still
has to satisfy the same `users.UserPreferences` columns.

`backend/features/onboarding_catalog.py` declares the six steps, their copy
slots, and their legal option values. It is served at
`/api/features/onboarding/catalog/`, and the editor builds its form from that —
so adding a copy slot in Python grows a field in the dashboard with no frontend
change, and the UI can never offer something the serializer would reject.

Two lists stay code-owned. **Instrument** names live in
`backend/users/instruments.py` and are pinned to the client by
`InstrumentCatalogTests.test_typescript_mirror_matches_this_module`; **Clarke
section** names come from the seeded study catalog. A variant picks *which* of
them to offer; the app supplies the names.

### Getting started

```bash
uv run manage.py seed_onboarding_config   # loads the flow the app ships with
```

Create-only by design: it seeds a row that exists to be edited, so re-running it
never reverts your copy changes (`--force` if you actually want that, `--dry-run`
to look first). Safe in a deploy hook — it heals an empty database and does
nothing to a populated one.

### Running an experiment

Duplicate a variant, edit the copy, then create an experiment picking the two
flows and a split. It starts as a draft; **Start** puts it live. One experiment
runs per surface at a time — two would assign the same account twice and neither
result would mean anything, so the second is refused with a 400.

Rules worth knowing before you read the numbers:

- **Assignment happens when someone opens onboarding**, not when they register,
  so "started" isn't diluted by accounts that sign up and never come back.
  Already-onboarded accounts hitting the endpoint through the account screen's
  edit links are never assigned.
- **Changing a weight never re-buckets anyone already assigned.** Bucketing is a
  hash of `(experiment key, user id)`, but the assignment row is what pins it.
- **Arms are frozen once it starts** — editing them mid-flight would invalidate
  the assignments pointing at them.
- Stopping an experiment leaves assigned players where they are; new arrivals
  get the default flow.

### Reading the results

| Column | Means |
| ------ | ----- |
| Started | Accounts served this arm (i.e. that opened onboarding) |
| Completed | Reached the end and got the completion stamp |
| Completion | Completed ÷ started |
| Practised | Recorded a gradable take within 7 days of assignment |
| Activation | Practised ÷ assignments old enough to have had those 7 days |

**Activation is the one that decides it.** A shorter flow will usually complete
more often; if it produces fewer players who actually practise, it is the worse
flow and completion rate alone would have called it a win. Takes the server
couldn't decode don't count — that's a broken recorder, not practice.

There is no significance testing: at this volume a p-value would be false
precision. Rates read "—" below 30 accounts per arm, where they are still noise.
The drop-off bars underneath show how far into the flow people got, from the
per-step beacons the app fires.

### If the config is unreachable

Onboarding cannot be allowed to fail, so both sides carry the shipped flow: the
backend serves it when no variant is seeded, and the app falls back to its own
bundled copy (`apps/mobile/src/data/onboardingConfig.ts`) whenever the request
fails. The app's copy is a *fallback*, not a mirror — the server wins whenever
it is reachable, so the two drifting apart is self-correcting.
