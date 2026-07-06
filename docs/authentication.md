# Authentication & Accounts

Email/password authentication owned entirely by the Django backend, using
short-lived JWT access tokens plus rotating refresh tokens. No third-party auth
platform is involved.

## Architecture overview

```
Expo app                              Django backend
────────                              ──────────────
AuthProvider (context)   ──login──▶   /api/auth/login/     ─┐
  status / user                        /api/auth/register/  ├─ simplejwt
authClient (services/auth)             /api/auth/refresh/   │  (HS256, SECRET_KEY)
  attach access token                  /api/auth/logout/    │
  refresh-on-401 (single-flight)       /api/auth/me/       ─┘
tokenStore (expo-secure-store)        users.User (custom, UUID pk, email login)
```

- **Backend** (`backend/users/`) is the source of truth. It issues and validates
  tokens with [`djangorestframework-simplejwt`](https://django-rest-framework-simplejwt.readthedocs.io/);
  JWT signing/verification is never hand-rolled.
- **Mobile** keeps auth state in one `AuthProvider` and never reads tokens from
  screens. The typed `authClient` attaches the access token, refreshes once on a
  401, and coordinates concurrent refreshes through a single in-flight promise.

## Account database model

`users.User` (`AUTH_USER_MODEL = "users.User"`) — the project's first and only
user model, introduced as a custom model so email is the login identifier.

| Field          | Type                | Notes                                      |
| -------------- | ------------------- | ------------------------------------------ |
| `id`           | UUID (pk)           | non-guessable primary key                  |
| `email`        | Email, **unique**   | normalized to lower-case; the login id     |
| `display_name` | Char(120)           | shown in the app                           |
| `is_active`    | Bool                | gates login                                |
| `is_staff`     | Bool                | gates Django admin                         |
| `password`     | (Django-managed)    | PBKDF2-hashed via `set_password`           |
| `created_at`   | DateTime            | `auto_now_add`                             |
| `updated_at`   | DateTime            | `auto_now`                                 |

Passwords go through Django's password APIs only — there is no separate password
field and nothing hashes passwords by hand. Future models (submissions, grading,
streaks) must reference `settings.AUTH_USER_MODEL`, never import `User` directly.

### Migration note

Because this is the first user model and no prior `auth.User` table exists in the
schema (users were deferred — see `backend/README.md`), swapping in the custom
model is safe: run `python manage.py migrate` on a database that has **not** yet
created Django's default user table. On an existing database that already ran the
default `auth` migrations, migrating to a custom user model is destructive and
must be done with a manual data-migration path instead.

## API endpoints

All under the existing `/api/` prefix. Register and login are public; the rest
require a valid access token (`Authorization: Bearer <access>`).

| Method | Path                  | Auth | Purpose                                             |
| ------ | --------------------- | ---- | --------------------------------------------------- |
| POST   | `/api/auth/register/` | ✗    | Create account → `{ user, access, refresh }` (201)  |
| POST   | `/api/auth/login/`    | ✗    | Email+password → `{ user, access, refresh }` (200)  |
| POST   | `/api/auth/refresh/`  | ✗*   | `{ refresh }` → `{ access, refresh }` (rotated)     |
| POST   | `/api/auth/logout/`   | ✓    | Blacklist the supplied `{ refresh }` (205)          |
| GET    | `/api/auth/me/`       | ✓    | Authenticated user's safe profile                   |

\* refresh authenticates via the refresh token itself, not an access token.

Safe profile shape (never includes password, staff flags, or internal fields):

```json
{ "id": "uuid", "email": "user@example.com", "display_name": "User Name", "created_at": "ISO-8601" }
```

Login returns a single generic `Invalid email or password.` for unknown emails
**and** wrong passwords, so it never reveals whether an account exists.

## Token lifecycle

1. **Register / login** → backend returns an access + refresh pair; the app saves
   both to secure storage and sets the user in state.
2. **Authenticated request** → `authClient` sends the access token. On a 401 it
   refreshes once and retries the request once (no infinite loops).
3. **Refresh** → `/auth/refresh/` issues a new access token and, because
   `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION` are on, a new refresh
   token while blacklisting the old one. A replayed old refresh token is rejected.
4. **App relaunch** → the provider enters `initializing`, reads the stored refresh
   token, calls `/auth/me/` (refreshing if the access token expired), and only
   then marks the user authenticated. The splash stays up throughout, so neither
   login nor protected content is flashed.
5. **Logout** → `/auth/logout/` blacklists the refresh token (best effort) and the
   app wipes secure storage regardless.
6. **Invalid/expired session** → a definitively invalid refresh clears secure
   storage and returns the user to login. Transient network failures are handled
   separately and do **not** discard credentials.

Default lifetimes: access **15 min**, refresh **7 days** (both configurable, see
env vars).

## Secure storage approach

Tokens are stored with **`expo-secure-store`** (iOS Keychain / Android Keystore) —
**never** AsyncStorage. On web, where SecureStore has no implementation, the store
falls back to origin-scoped `localStorage`. Only the token pair is persisted;
non-sensitive profile data is cached in memory with the backend as source of
truth. Tokens, password hashes, and secrets are never logged.

## Permissions & security

- DRF defaults to `IsAuthenticated`; public endpoints opt out explicitly
  (`AllowAny` on register, login, and the read-only study catalog).
- Login/register are throttled via DRF `ScopedRateThrottle`
  (`auth_login`, `auth_register`).
- JWTs are signed with `SECRET_KEY` (keep it secret in prod). CORS stays narrow
  (unchanged from the existing config); CSRF is not disabled globally.
- Account creation is wrapped in a DB transaction.

## Environment variables

**Backend** (`backend/.env.example`):

| Variable                        | Default    | Purpose                                  |
| ------------------------------- | ---------- | ---------------------------------------- |
| `SECRET_KEY`                    | dev value  | Django secret **and** JWT signing key    |
| `ACCESS_TOKEN_LIFETIME_MINUTES` | `15`       | access-token lifetime                    |
| `REFRESH_TOKEN_LIFETIME_DAYS`   | `7`        | refresh-token lifetime                   |
| `THROTTLE_AUTH_LOGIN`           | `10/min`   | login rate limit                         |
| `THROTTLE_AUTH_REGISTER`        | `5/min`    | register rate limit                      |

**Mobile** (`apps/mobile/.env.example`): `EXPO_PUBLIC_API_URL` — the API base URL.

## Local mobile-to-backend networking

`localhost` on a phone/emulator is the device itself, not your dev machine. The
app resolves the API base URL in this order (`src/services/api.ts`):

1. `EXPO_PUBLIC_API_URL` if set (production / explicit override).
2. Otherwise the Metro dev-server host with Django's port
   (`http://<your-LAN-ip>:8000`) — so a physical device hits your machine.
   On the **Android emulator**, a `localhost`/`127.0.0.1` host is rewritten to
   `10.0.2.2`, the emulator's alias for the host machine.
3. `http://localhost:8000` as a last resort (web).

Always run Django on all interfaces so the device/emulator can reach it:

```bash
python manage.py runserver 0.0.0.0:8000
```

Host-header checks: when `ALLOWED_HOSTS` is left unset, `DEBUG=1` accepts any
Host — convenient because a phone/emulator reaches the machine over a LAN IP that
changes with DHCP. Set `ALLOWED_HOSTS` explicitly to lock it down (always do so
in production, where it is required). For the **iOS simulator**, `localhost`
already refers to the host machine, so no host remap is needed.

Quick reference:

| Target                | Reaches host at        | Extra setup                          |
| --------------------- | ---------------------- | ------------------------------------ |
| Android emulator      | `10.0.2.2`             | in `ALLOWED_HOSTS` by default        |
| iOS simulator         | `localhost`            | none                                 |
| Physical device       | machine's LAN IP       | add LAN IP to `ALLOWED_HOSTS`        |
| Web                   | `localhost`            | none                                 |

Don't hard-code `localhost` in production; set `EXPO_PUBLIC_API_URL` to the
deployed API instead.

### Gotcha: never attach an `AbortSignal` to a file upload

On React Native (Android especially), attaching an `AbortController` signal to a
`fetch` whose body is a `FormData` containing a file (`{ uri, name, type }`)
makes the native networking layer fail with `TypeError: Network request failed`
**immediately** — the request never leaves the device, so nothing appears in the
backend logs. JSON requests are unaffected, which makes this look like a
backend-connectivity problem when it's purely client-side.

`safeFetch` in `services/auth/client.ts` therefore **skips the abort-based
timeout when `init.body instanceof FormData`** (the grading upload in
`services/api.ts` is the only such request today). JSON requests keep the 15s
timeout. If you add another multipart upload, route it through the same helper —
do not re-introduce a signal on the upload path. Symptoms of the regression:
uploads fail instantly with "could not reach the service" while login/profile
calls work and a browser GET returns JSON.

Also: don't swallow the error at the call site. Log the caught error (as
`record.tsx` does) so a real failure — an HTTP status, a JSON parse error, an
unreadable file URI — isn't masked by a generic "backend down" message.

## Commands

Backend (from `backend/`, with the Python env active and `DATABASE_URL` set):

```bash
python manage.py migrate          # apply migrations (users + token_blacklist)
python manage.py createsuperuser  # admin account (prompts for email + password)
python manage.py test users       # auth tests
python manage.py test             # full backend suite
```

Mobile (from repo root):

```bash
pnpm mobile:test        # jest (auth client, context, screens, route guard)
pnpm mobile:typecheck   # tsc --noEmit
pnpm mobile:lint        # eslint
pnpm mobile:ci          # full gate (lint, typecheck, doctor, test, config, export)
```
