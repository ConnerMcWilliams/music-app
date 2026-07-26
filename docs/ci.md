# Continuous Integration

This document describes the automated checks that run on pull requests and pushes
to `main`. The bulk of it covers the **frontend (Expo mobile app)** pipeline; the
website (`apps/web`), the admin dashboard (`apps/admin`), and the backend have
their own path-filtered workflows — `web-ci.yml`, `admin-ci.yml`, and the
`backend` job in `ci.yml`, all summarized below (site details in `web.md`,
dashboard details in `admin.md`, API details in `backend/README.md`).

## Frontend CI (`.github/workflows/mobile-ci.yml`)

### When it runs

On pull requests and on pushes to `main`, but only when files that can affect the
mobile app change. The path filter covers:

```txt
apps/mobile/**
packages/**            # shared packages (when they exist)
package.json           # root convenience scripts / packageManager
pnpm-lock.yaml
pnpm-workspace.yaml
.github/workflows/mobile-ci.yml
```

Outdated runs for the same branch are cancelled automatically (concurrency), and
the workflow runs with `permissions: contents: read`.

### What it verifies

**Job 1 — Quality checks**

1. Dependency installation with `pnpm install --frozen-lockfile`
2. Dependency health (`expo-doctor`) — validates that installed native/Expo
   dependency versions are the ones Expo SDK 56 expects and that no duplicate or
   conflicting packages slipped in. This guards the exact class of bug the
   Android build fix addressed (pnpm under-selecting `@expo/metro-runtime` /
   `@expo/dom-webview`).
3. Linting (`expo`/ESLint flat config)
4. TypeScript type checking (`tsc --noEmit`)
5. Unit and component tests (Jest + `jest-expo` + React Native Testing Library),
   with coverage uploaded as the `mobile-coverage` artifact

**Job 2 — Expo smoke test**

6. Expo configuration validation (`expo config --type public`)
7. Expo bundle/export generation for all platforms
   (`expo export --platform all`). On failure the partial `dist-ci` output is
   uploaded as the `mobile-expo-export` artifact.

### What the Expo export smoke test catches

The export step actually bundles the app (Metro) for Android, iOS, and web. It
catches problems a plain typecheck/lint miss, such as:

- Import errors or missing modules that only surface when Metro resolves the graph
- Invalid or misconfigured Expo Router routes
- Broken `app.json` / plugin configuration
- Assets referenced but not present
- Code that type-checks but fails to bundle

### What CI does **not** verify

- **Real device recording/upload behavior.** The highest-risk feature —
  recording and uploading media from a physical device — cannot be validated in
  CI. It still requires manual testing on real Android and iOS hardware.
- Native Android/iOS builds (no Gradle/Xcode build runs on PRs by design). The
  native projects are generated (Expo CNG) and must be regenerated after SDK
  changes — see `docs/native-builds.md`.
- End-to-end / UI automation (no Maestro/Detox).
- Runtime behavior against a real backend (CI uses a placeholder API URL).
- The backend (see *Backend CI* below).

## Reproducing CI locally

Prerequisites:

- **Node `>=20.19.4`** (Expo SDK 56 requirement). CI uses Node 22.
- **pnpm** (pinned via the root `packageManager` field). Enable with
  `corepack enable`, or install pnpm directly.

Install mobile dependencies once, then run the full pipeline from the repo root:

```bash
pnpm mobile:install     # pnpm --dir apps/mobile install
pnpm mobile:ci          # lint + typecheck + test + validate + export
```

Individual steps (also runnable from the repo root):

```bash
pnpm mobile:lint
pnpm mobile:typecheck
pnpm mobile:doctor      # expo-doctor (dependency health)
pnpm mobile:test        # jest --ci --runInBand --coverage
pnpm mobile:validate    # expo config --type public
pnpm mobile:export      # expo export --platform all --output-dir dist-ci
```

Or run them directly inside the app:

```bash
cd apps/mobile
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm doctor && pnpm test:ci && pnpm validate:expo && pnpm export:ci
```

## Environment variables in CI

- Only `EXPO_PUBLIC_*` variables are exposed to the app, and they are **bundled
  into the client** — never put secrets in them.
- The Expo export job sets a safe placeholder `EXPO_PUBLIC_API_URL` so CI never
  needs production secrets. See `apps/mobile/.env.example`.
- Backend secrets (Django `SECRET_KEY`, database URLs, AWS/service-role keys)
  must never be added to the mobile environment.

## Tests

- Test runner: **Jest** with the **`jest-expo`** preset and
  **`@testing-library/react-native`**.
- Config: `apps/mobile/jest.config.js`.
- Tests live in `apps/mobile/tests/` — deliberately **outside** the Expo Router
  `src/app/` directory so they are never treated as routes.
- No coverage thresholds are enforced yet.

## Website CI (`.github/workflows/web-ci.yml`)

The marketing site (`apps/web`) has its own workflow, mirroring the per-app
convention. It runs on pull requests and pushes to `main`, path-filtered to
`apps/web/**`, root `package.json`, and `.github/workflows/web-ci.yml` (so
mobile/backend changes don't trigger it), with the same concurrency cancellation
and `permissions: contents: read` as mobile CI.

A single **Quality checks** job installs `apps/web`'s own lockfile with
`pnpm install --frozen-lockfile`, then runs lint → typecheck → build:

```bash
pnpm web:install   # pnpm --dir apps/web install
pnpm web:ci        # web:lint + web:typecheck + web:build
```

There are no tests yet — the site is statically rendered. See `web.md` for the
site's structure, placeholders, the backend integration, and launch plan.

## Admin dashboard CI (`.github/workflows/admin-ci.yml`)

The owner-only dashboard (`apps/admin`) has its own workflow, cloned from
`web-ci.yml`. It runs on pull requests and pushes to `main`, path-filtered to
`apps/admin/**`, root `package.json`, and `.github/workflows/admin-ci.yml`, with
the same concurrency cancellation and `permissions: contents: read`.

A single **Quality checks** job installs `apps/admin`'s own lockfile with
`pnpm install --frozen-lockfile`, then runs lint → typecheck → build:

```bash
pnpm admin:install   # pnpm --dir apps/admin install
pnpm admin:ci        # admin:lint + admin:typecheck + admin:build
```

Like the site, there are no tests yet. See `admin.md` for the dashboard's pages,
the admin↔Django endpoint contract, and newsletter mechanics.

## Backend CI (`.github/workflows/ci.yml`)

The Django API's workflow runs on pull requests and pushes to `main`,
path-filtered to `backend/**` and `.github/workflows/ci.yml`, with the same
concurrency cancellation and `permissions: contents: read` as the others. The
job carries `timeout-minutes: 30` so a wedged step fails fast instead of holding
the runner and the concurrency group for the 6-hour default.

A single **Backend checks** job runs on Python 3.12 against a real Postgres 16
(`DATABASE_URL=postgres://studies:studies@localhost:5432/studies`, plus CI-only
`SECRET_KEY` and `DEBUG=0`):

1. Start Postgres (see below)
2. Install with `pip install -e ".[dev]"` (pip cache keyed on `pyproject.toml`)
3. Lint (`ruff check .`)
4. Missing-migration check (`python manage.py makemigrations --check --dry-run`)
5. Tests (`python manage.py test --verbosity 2`)

### How Postgres is provisioned

Tests run against Postgres rather than SQLite to avoid dialect drift, and the
version matches production's managed Postgres. The container is started by the
**`Start Postgres` step**, not by a `services:` block: service-container images
are pulled *before any step runs*, so that pull can't be retried, redirected, or
diagnosed from the workflow — a Docker Hub blip fails the job before checkout
(that is how run 30182954087 died). Starting the container from a step buys:

- **A mirror.** `public.ecr.aws/docker/library/postgres:16` (ECR Public's copy
  of the Docker official image) is tried first because it isn't subject to
  Docker Hub's per-IP anonymous pull limits, which shared Actions runners
  routinely exhaust. Docker Hub's `postgres:16` stays as the fallback.
- **Retries.** Three rounds, each walking both registries in preference order
  before backing off, so a wedged mirror costs one attempt rather than all
  three. Every pull is bounded by `timeout 180s`, so a stalled pull fails its
  attempt instead of hanging the job.
- **Readable failures.** The step waits up to 120s for the published port to
  accept connections (`pg_isready` over TCP, not the unix socket, which would
  report ready while the entrypoint's temporary initdb server is still up), and
  stops early if the container exits. Either way it dumps `docker logs` before
  failing, and a `Postgres logs` step re-dumps them if any *later* step fails —
  `services:` containers get their logs captured automatically, a plain
  container does not.

`Could not pull the Postgres image from any registry` means both registries were
unreachable — a registry outage, not a code failure. Re-run the job.
