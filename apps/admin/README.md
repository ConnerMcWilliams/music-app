# Clarke Coach — admin dashboard

Internal, owner-only dashboard for Clarke Coach (Next.js App Router, TypeScript,
CSS Modules — same stack and design tokens as `apps/web`). Four pages behind a
staff login: signup and conversion analytics (members, unique visitors,
conversion rate, waitlist breakdowns by role/instrument/skill, per-traffic-source
conversion, filterable browser), newsletter compose-and-send to subscribed
waitlist signups (with per-recipient unsubscribe links), publishing posts to
the website's `/updates` page, and **Config** — editing the mobile onboarding
flow and A/B testing two versions of it without shipping an app build. All data
comes from the Django API's `IsAdminUser`-gated `/api/dashboard/...`,
`/api/updates/manage/...` and `/api/features/...` endpoints (base URL via
`NEXT_PUBLIC_API_URL`; see `.env.example`).

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:3100 (web owns 3000)
```

Or from the repo root: `pnpm admin:dev`.

The backend must be running (`uv run manage.py runserver` in `backend/`), and
you sign in with a **staff** account — create one with
`uv run manage.py createsuperuser`. In `DEBUG`, newsletter emails print to the
backend console instead of sending.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Full documentation (auth model, endpoint contract, newsletter mechanics and
limits, deployment requirements): [`docs/admin.md`](../../docs/admin.md).
