# Security

What is enforced today, where it lives, and what is deliberately still open.
This is a working checklist, not a claim that the app "is secure."

## Enforced

**Authentication (backend `users/`, docs/authentication.md)**
- JWT via djangorestframework-simplejwt; HS256 signed with `SECRET_KEY`;
  access 15 min, refresh 7 days, rotation + blacklist on use.
- DRF default permission is `IsAuthenticated`; public endpoints opt out
  explicitly (`AllowAny`: register, login, google, refresh, study catalog only, and the marketing-site waitlist and contact forms).
- Login returns one generic message for unknown email / wrong password /
  inactive account (no account enumeration); register/login/google are throttled.
- Google sign-in verifies the ID token server-side (`users/google.py`:
  signature via Google's JWKS, expiry, issuer, and `aud` ∈
  `GOOGLE_OAUTH_CLIENT_IDS`) and returns the same generic failure message for
  every rejection (bad token, unverified email, inactive/conflicting account),
  so it leaks nothing about which emails are registered.
- Identity always comes from the validated token (`request.user`) — no
  endpoint accepts a client-supplied user id.

**Submissions (backend `grading/`)**
- `POST /api/submissions/` requires authentication and attributes the take to
  the token user; upload throttled per user (`submissions`, default 20/min).
- Upload validation: non-empty, ≤30 MB, extension allowlist (audio formats
  only). Stored path is server-generated
  (`submissions/<uuid>/take.<sanitized-suffix>`) — never user-controlled.
- `GET /api/submissions/` (also auth-required) lists **only the caller's own**
  takes (`filter(user=request.user)`), so there is no cross-user read surface;
  the query scoping is pinned by tests. Listing is not throttled.

**Waitlist (backend `waitlist/`)**
- `POST /api/waitlist/` is public (`AllowAny` — the marketing site has no auth)
  and throttled per client IP (`waitlist`, default 10/hour). It captures an
  email plus optional free-text context and grants no access.
- Duplicate signups are idempotent: the response is always `201 {"email"}`
  whether the row was new or already existed, so it never confirms membership,
  and existing rows are never overwritten (first-write-wins).

**Contact (backend `contact/`)**
- `POST /api/contact/` is public (`AllowAny` — the marketing site has no auth)
  and throttled per client IP (`contact`, default 10/hour). Every submission is
  a new message (not idempotent), so the cap stays low to blunt spam. It
  validates `name`/`email`/`message` in a serializer, stores the message, and
  grants no access.
- Each submission triggers a notification email to `CONTACT_NOTIFICATION_EMAIL`
  (with the submitter set as `Reply-To`). It is best-effort and sent after the
  row is saved, so a mail-backend outage never loses the message or 500s the
  visitor; a short `EMAIL_TIMEOUT` (default 10s) caps how long a send may block.
- SMTP credentials come from the environment (`EMAIL_*` in `.env.example`);
  `EMAIL_HOST_PASSWORD` is a secret and never enters the repo. In `DEBUG` the
  default console backend prints mail to the terminal, so no credentials are
  needed for local dev.

**Mobile (`apps/mobile/src/services/`)**
- Tokens live in expo-secure-store (Keychain/Keystore); web falls back to
  origin-scoped localStorage. Never AsyncStorage; never logged.
- One API base URL (`services/api.ts`), one auth attachment point
  (`authClient.authedRequest`); refresh-on-401 happens once, then the session
  is cleared. Logout wipes local tokens even if the server call fails.
- No secrets in the app: every `EXPO_PUBLIC_*` var ships in the JS bundle by
  design, so only public identifiers belong there — the API URL and the Google
  OAuth client IDs (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` /
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`), which are not secrets.

**Transport/config**
- CORS: dev allows all origins (`DEBUG=1` default) because the API is
  token-based with `CORS_ALLOW_CREDENTIALS = False`; production must set
  `CORS_ALLOW_ALL_ORIGINS=0` + explicit `CORS_ALLOWED_ORIGINS`.
- CSRF: the app authenticates with bearer tokens (not cookies), so CSRF does
  not apply to it; Django's CSRF middleware stays on for the session-backed
  admin/browsable API.
- Errors return DRF's safe JSON shapes; the mobile client never surfaces raw
  server bodies/HTML to users.

## Known gaps / follow-ups (ordered)

1. **Prod settings hardening:** fail hard at startup when `DEBUG=0` and
   `SECRET_KEY` is the dev default; add HTTPS settings
   (`SECURE_*`, HSTS) behind an env flag before first deploy.
2. **Media exposure:** dev serves `MEDIA_ROOT` openly (unguessable UUID paths,
   dev-only). Before prod: object storage + signed URLs; never proxy uploads
   through `static()`.
3. **Upload content inspection:** the allowlist checks the extension, not the
   bytes. The grading engine already rejects undecodable audio safely; add
   content sniffing if uploads are ever redistributed/served to other users.
4. **Session-expiry UX:** an `AuthError` during submit shows "sign in again"
   but doesn't flip the global auth state; wire it to `signOut()` so the route
   guard redirects.
5. **Refresh-token storage on web** is localStorage (XSS-readable). Fine for
   dev; revisit before a real web launch.
6. **Global anonymous throttle:** per-user throttles exist; consider an
   `AnonRateThrottle` for login/register/google beyond the scoped ones if abuse
   shows.

## Rules

- Never weaken `IsAuthenticated`, upload validation, or CORS to "make the app
  work" — the app not reaching the backend is a networking problem
  (docs/troubleshooting.md), not a permissions problem.
- New endpoints: declare permissions explicitly, validate all input in a
  serializer, and add tests for the unauthenticated + cross-user cases in the
  same PR.
- New env vars go in `.env.example` (backend and/or mobile) with a comment.
  Real secrets never enter the repo or `EXPO_PUBLIC_*`.
