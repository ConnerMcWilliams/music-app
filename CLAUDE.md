@AGENTS.md

# CLAUDE.md

Guidance for AI assistants working in this repository. `AGENTS.md` (imported
above) holds the hard rules and guardrails; this file is the map — how the
codebase is laid out, how to build and test each part, and the conventions to
follow. When they seem to conflict, `AGENTS.md` and the `docs/` files win, and
the code wins over both.

## What this is

**Clarke Coach** — a music-practice app for Clarke's *Technical Studies* (brass
étude corpus). The core loop: pick a study → practice it → record a take →
upload it → the backend grades it against a rubric and returns a score with
coaching feedback and a per-note pitch/rhythm overlay. Streaks, an XP/level/coin
reward economy, and practice history accrue as the player practices.

It is a **pnpm + Python monorepo** with four deployables:

| Path          | Stack                        | What it is |
| ------------- | ---------------------------- | ---------- |
| `apps/mobile` | Expo SDK 56 (React Native)   | The product: auth, study selection, recording, grading results, streaks/rewards, notation rendering, live analytical mode. Expo Router. |
| `apps/web`    | Next.js (App Router, static) | Public marketing / waitlist site. Posts waitlist, contact, and page-visit beacons to the backend. |
| `apps/admin`  | Next.js (App Router, static) | Owner-only internal dashboard (port 3100). Signup/conversion analytics, newsletter, updates publishing, onboarding config + A/B experiments. Not linked from any public surface. |
| `backend`     | Django + DRF, Postgres       | The API and grading engine. Owns users, studies, submissions, grading, progress/rewards, waitlist, contact, analytics, dashboard, updates, features. |

Each `apps/*` package is **self-contained**: its own `package.json`, own
lockfile, own ESLint/TS config, and its own path-filtered CI workflow. There is
no shared pnpm workspace yet (`packages/**` is reserved but empty).

## Repository layout

```
apps/
  mobile/        Expo app
    src/
      app/           Expo Router routes — (auth), (tabs), onboarding/, record, recordings, section, account
      components/    UI — auth/, onboarding/, practice/ (incl. MusicXmlView, ScoreSheet, ExpandedScoreModal)
      context/       React context providers (auth state lives here)
      data/          Bundled catalog + generated MusicXML (gen'd from backend seed by scripts/)
      hooks/         useLiveAnalysis, useMetronome, useScorePaging, …
      lib/           Pure logic — analysis/ (live), metronome/, musicxml/ (parse + layout), pitch/ (FFT), orientation.ts
      services/      Backend I/O — api.ts (the ONE base-URL source), auth/, submissions, profile, …
      theme/  types/
    tests/         Jest tests — deliberately OUTSIDE src/app so they aren't treated as routes
    scripts/       gen-musicxml.mjs, etc.
  web/    app/ components/ lib/          Next.js marketing site
  admin/  app/ components/ lib/          Next.js admin dashboard
backend/
  config/        Django project — settings.py, urls.py, exception_handler.py, mixins.py, attribution.py
  users/         Custom email-login user model (UUID pk) + JWT auth + Google sign-in + UserPreferences + instruments.py
  studies/       Study catalog + StudyContent (MusicXML) + import_clarke; seed/ has clarke.py + musicxml/
  grading/       Submission/GradingResult + /api/submissions/; engine/ is a Django-free NumPy pipeline
  progress/      Profile (streaks + aggregate stats) + rewards.py (XP/levels/coins/freezes)
  waitlist/  contact/  analytics/        Public marketing-site endpoints (+ newsletter/unsubscribe)
  dashboard/  updates/  features/        Staff-only admin endpoints (analytics, updates, onboarding config + A/B)
  scripts/       clarke_omr.py, generate_clarke_musicxml.py (notation generation, not runtime)
docs/            Architecture and contracts — see below
.github/         workflows/ (ci.yml, mobile-ci.yml, web-ci.yml, admin-ci.yml), ISSUE_TEMPLATES/, pull_request_template.md
```

## Documentation — read before touching related code

`docs/` is the source of truth for design and contracts. Start with
`docs/architecture.md`. Before editing the areas below, read the matching doc:

| Doc | Read before working on |
| --- | --- |
| `docs/architecture.md`    | Anything — the stack, boundaries, and why each piece exists. |
| `docs/api.md`             | **Any API/auth/submission code** — endpoints, the submission contract, mobile integration rules. |
| `docs/security.md`        | Auth, permissions, CORS, uploads — what must never be weakened. |
| `docs/authentication.md`  | JWT lifecycle, the Google flow, the custom user model, secure storage. |
| `docs/troubleshooting.md` | **"The app can't reach the backend"** — dev networking. Read this BEFORE changing auth/CORS/permissions to "fix" an unreachable backend. |
| `docs/error-handling.md`  | How failures are surfaced and traced across the stack. |
| `docs/grading-rubric.md`  | The grading engine, rubric weights, and when note-level grading is skipped. |
| `docs/git-workflow.md`    | Branching, commits, PRs, CI expectations. |
| `docs/ci.md`              | Every workflow, what CI does and does not verify. |
| `docs/web.md` / `docs/admin.md` | The marketing site / admin dashboard contracts. |
| `docs/product.md`         | Product scope, the instrument list, the study corpus. |
| `docs/native-builds.md`   | Regenerating native projects (Expo CNG) after SDK/native changes. |

## Development workflows

### Prerequisites
- **Node `>=20.19.4`**, **pnpm** (pinned via root `packageManager`; `corepack enable`).
- **Python 3.11+** and **Docker** (local Postgres) for the backend.

### Root convenience scripts (per-app; run from repo root)
```bash
pnpm mobile:install / mobile:ci      # lint + typecheck + doctor + test + validate + export
pnpm web:install    / web:ci         # lint + typecheck + build
pnpm admin:install  / admin:ci       # lint + typecheck + build
pnpm web:dev                         # marketing site dev server
pnpm admin:dev                       # admin dashboard dev (port 3100)
```
There is no root `pnpm install`/`pnpm dev`/`pnpm test` that spans all apps —
each app installs and runs on its own. Use the `mobile:*` / `web:*` / `admin:*`
scripts (the AGENTS.md `pnpm install`/`pnpm dev`/etc. shorthands map to these).

### Mobile (`apps/mobile`)
```bash
pnpm --dir apps/mobile start         # Expo dev server
pnpm --dir apps/mobile test          # Jest (watch)
```
Set `EXPO_PUBLIC_API_URL` for a non-default backend host. **Never hard-code API
hosts or endpoint strings** — see conventions below.

### Backend (`backend/`)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env                 # set SECRET_KEY etc.
docker compose up -d db              # local Postgres
python manage.py migrate
python manage.py import_clarke                 # seed the Clarke catalog (190 exercises)
python manage.py seed_onboarding_config        # make the shipped onboarding flow editable in admin
python manage.py runserver 0.0.0.0:8000        # bind ALL interfaces — NOT bare runserver

python manage.py test                          # test suite (needs Postgres)
DATABASE_URL=sqlite:///test.sqlite3 python manage.py test   # no local Postgres
```
**Always `runserver 0.0.0.0:8000`.** A loopback-bound server answers the browser
on the dev machine but refuses every phone/emulator connection — this is the #1
"backend unreachable" cause (see `docs/troubleshooting.md`), not an auth/CORS bug.

### CI (must pass before merge)
Four path-filtered workflows in `.github/workflows/`. Reproduce locally:
```bash
pnpm mobile:ci                       # mobile-ci.yml
pnpm web:ci                          # web-ci.yml
pnpm admin:ci                        # admin-ci.yml
cd backend && ruff check . && python manage.py makemigrations --check --dry-run && python manage.py test   # ci.yml
```
Backend CI runs against a real **Postgres 16** (not SQLite). Note: backend CI is
*also* triggered by edits to `apps/mobile/src/data/instruments.ts`, because the
suite pins that client mirror against `backend/users/instruments.py`. CI does
**not** run native Android/iOS builds, real device recording/upload, or E2E.

### Git workflow
Trunk-based. `main` is protected and deployable at all times — **never commit or
push to `main`**. Work on short-lived branches, use **conventional commits**
(`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), keep PRs small
(usually <10 files) and scoped to one issue. Prefer squash merges. See
`docs/git-workflow.md`.

> This session's designated working branch is `claude/claude-md-docs-phsdte`.
> Develop, commit, and push there — not to `main`.

## Key conventions

### Cross-cutting
- **TypeScript, strictly.** No new dependencies without asking and explaining why
  (the Expo dependency graph is fragile — `expo-doctor` gates it in CI).
- **Prefer existing components and patterns** over new ones. Match the
  surrounding code's naming, comment density, and idioms.
- **Validate all external input.** User-facing UI needs loading, empty, and
  error states.
- **Update the relevant `docs/` file when you change architecture or a contract.**
- Do not change auth, payments, database schema, or permissions **without tests**.
- The frameworks are pinned to versions that differ from common training data:
  read the versioned Expo docs (SDK 56) and `node_modules/next/dist/docs/`
  before writing mobile/web code — see the sub-app `AGENTS.md` files.

### API integration (mobile ↔ backend)
- The API base URL is defined **once**: `apps/mobile/src/services/api.ts`
  (`EXPO_PUBLIC_API_URL` override → Metro-derived host → localhost). Never
  hard-code hosts or endpoint strings anywhere else.
- Auth is attached in **one place**: `authClient.authedRequest`. Screens never
  read tokens. Tokens live in Expo **SecureStore**, never AsyncStorage.
- **Django routes end in a trailing slash.** A POST without it fails (no redirect).
- `POST /api/submissions/` **requires auth** and takes multipart form data; the
  submitter always comes from the token, never a payload field. This is what
  keeps streaks/XP unspoofable — do not weaken it.

### Backend
- Ruff (line length 100, `E,F,I,UP,B`); migrations are excluded from lint. A
  missing-migration check runs in CI — regenerate migrations when models change.
- Every take persists as `Submission` + `GradingResult`. Grading logic that
  compares audio to notation must go through `grading/engine/timeline.py` (the
  single place transposition is applied) — don't re-apply the `-2` semitone offset.
- The grading `engine/` is deliberately **Django-free and NumPy-only** — keep it
  importable without Django.

### Mobile-specific
- **MusicXML notation:** use the existing renderer
  (`components/practice/MusicXmlView.tsx` + `ScoreSheet.tsx`, layout in
  `lib/musicxml/layout.ts`, parsing in `lib/musicxml/parseMusicXML.ts`). Do
  **not** write a new renderer or add an XML-parser dependency — extend the
  existing subset. Introduce a WebView engine only after recording that decision
  in `docs/architecture.md`.
- **Live analytical mode** (`lib/analysis/`, `lib/pitch/`) is a deliberate port
  of the backend engine (`backend/grading/engine/analysis.py` + `align.py`) —
  frame geometry and match constants are shared. If you change one side, change
  the other, or a take reads green live and red in results.
- Screen orientation is portrait everywhere except the fullscreen score modal;
  all orientation changes go through `lib/orientation.ts` (lazy `require`).
- Tests live in `apps/mobile/tests/`, kept out of `src/app/` so Expo Router
  never treats them as routes.

### Sensitive areas (extra care, tests required)
Environment-variable handling, payment/subscription logic, auth, permissions,
CORS, database schema. When in doubt, read `docs/security.md` and ask.
