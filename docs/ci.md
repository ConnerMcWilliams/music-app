# Continuous Integration

This document describes the automated checks that run on pull requests and pushes
to `main`. The bulk of it covers the **frontend (Expo mobile app)** pipeline; the
website (`apps/web`) and backend have their own path-filtered workflows —
`web-ci.yml` (summarized below; details in `web.md`) and the `backend` job in
`ci.yml`.

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
- The backend (see the separate `backend` job in `.github/workflows/ci.yml`).

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
