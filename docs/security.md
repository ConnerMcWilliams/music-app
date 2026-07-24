# Security

What is enforced today, where it lives, and what is deliberately still open.
This is a working checklist, not a claim that the app "is secure."

## Enforced

**Authentication (backend `users/`, docs/authentication.md)**
- JWT via djangorestframework-simplejwt; HS256 signed with `SECRET_KEY`;
  access 15 min, refresh 7 days, rotation + blacklist on use.
- DRF default permission is `IsAuthenticated`; public endpoints opt out
  explicitly (`AllowAny`: register, login, google, refresh, study catalog only, and the marketing-site waitlist and contact forms and the anonymous page-visit beacon).
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
  and existing rows are never overwritten (first-write-wins). Because this is the
  intended anti-enumeration behaviour, the UI shows the same calm success either
  way — there is deliberately **no** "you're already on the list" message.
- Only `application/json` is accepted (`parser_classes = [JSONParser]`), so a
  wrong content type is a `415` and malformed JSON is a `400` — never a 500.
- A hidden **honeypot** field (`company`) defends against bots: the form hides it
  (off-screen, `tabindex=-1`), and any submission with it filled is answered like
  a normal `201` success but **persisted nothing** (so the bot learns nothing).
- `GET /api/waitlist/unsubscribe/?token=` is public and throttled per client IP
  (`unsubscribe`, default 30/hour). The token is the signup's pk signed with
  `SECRET_KEY` (`waitlist/tokens.py`, salt `waitlist.unsubscribe`, no expiry) —
  stateless, so a tampered/garbage token changes nothing (400) while a valid one
  flips `subscribed=False` idempotently without confirming the address is on the
  list. One-click GET means a mail scanner that prefetches links can unsubscribe
  someone silently — accepted at this scale. Rotating `SECRET_KEY` invalidates
  every link already sent.

**Contact (backend `contact/`)**
- `POST /api/contact/` is public (`AllowAny` — the marketing site has no auth)
  and throttled per client IP (`contact`, default 10/hour). Every submission is
  a new message (not idempotent), so the cap stays low to blunt spam. It
  validates `name`/`email`/`message` in a serializer, stores the message, and
  grants no access.
- Each submission triggers a notification email to `CONTACT_NOTIFICATION_EMAIL`
  (with the submitter set as `Reply-To`). It is best-effort and sent after the
  row is saved, so a mail-backend outage never loses the message or 500s the
  visitor; a short send timeout (default 10s — `ANYMAIL['REQUESTS_TIMEOUT']`
  under the Resend default, `EMAIL_TIMEOUT` under the SMTP fallback) caps how
  long a send may block.
- Same abuse defences as the waitlist: JSON-only (`415`/`400` on bad bodies) and
  the `company` honeypot (a filled value is dropped without persisting or
  emailing), plus the `message` field is capped at 5000 chars.
- Production sends over Resend's HTTPS API (django-anymail); `RESEND_API_KEY`
  comes from the environment and is a secret that never enters the repo (as is
  the SMTP fallback's `EMAIL_HOST_PASSWORD`). In `DEBUG` the default console
  backend prints mail to the terminal, so no credentials are needed for local
  dev.

**Analytics (backend `analytics/`)**
- `POST /api/site/visit/` is public (`AllowAny` — the marketing site has no auth)
  and throttled per client IP (`analytics`, default 120/hour). It records an
  anonymous page view for the conversion-rate denominator and grants no access.
- Privacy-light by design: **no IP address and no user-agent are stored** — only
  an anonymous browser-minted `visitor_id`, the path, and a normalized traffic
  source. A coarse bot filter drops crawler / empty-UA hits, and the response is
  always `204`, so it reveals nothing and stays cheap for the fire-and-forget
  beacon. The privacy policy (`apps/web` `/privacy`) discloses it.

**Admin dashboard (backend `dashboard/`, `updates/`; `apps/admin`)**
- The dashboard endpoints (`/api/dashboard/*` and `/api/updates/manage/*`) are
  the codebase's first **staff-only** surface: gated with DRF `IsAdminUser`
  (`User.is_staff`), so a normal app account authenticates but gets 403. They
  reuse the existing JWT auth — no new login path or token type.
- `GET /api/updates/` is the one public endpoint here (`AllowAny`, throttled
  `updates_public`, default 120/hour): read-only, returns only `published`
  posts, and grants nothing.
- Every admin/subscriber response sends `Cache-Control: no-store` (`NoStoreMixin`)
  so subscriber emails and analytics are never cached by the browser or an
  intermediary.
- Authorization is enforced **server-side** on every request. The `apps/admin`
  Next app only *hides navigation and redirects client-side* for UX; a user who
  loads an admin route's markup without a token still gets nothing, because the
  data lives behind `IsAdminUser` (missing token → `401`, non-staff → `403`).
  Admin `401`/`403` responses are logged (see Logging).
- The `apps/admin` client stores its JWTs in `localStorage` (XSS-readable) — an
  accepted trade-off for a single-owner internal tool that is not linked from
  any public surface (same caveat as web refresh-token storage, gap #4 below).

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
  server bodies/HTML to users. See `docs/error-handling.md` for the full
  convention (error pages, user-facing copy, the generic-500 `{detail,reference}`
  shape).

**Backend hardening (`config/settings.py`)**
- **`SECRET_KEY` fail-fast:** when `DEBUG=0` and the key is still the dev default,
  a *served* boot (gunicorn/uvicorn/`runserver`) raises `ImproperlyConfigured`.
  Management commands (`test`, `migrate`, …) are exempt so tooling/CI still run.
- **HTTPS settings**, active when non-debug **and** not a test run
  (`_HARDENED`), all env-overridable: `SECURE_SSL_REDIRECT`,
  `SECURE_HSTS_SECONDS` (default 2y; `SECURE_HSTS_PRELOAD` is **opt-in** — the
  browser preload list is a long-lived commitment), `SESSION_COOKIE_SECURE`,
  `CSRF_COOKIE_SECURE`, and `SECURE_PROXY_SSL_HEADER` (trusts `X-Forwarded-Proto`
  behind the TLS-terminating proxy). Always-on: `SECURE_CONTENT_TYPE_NOSNIFF`,
  `SECURE_REFERRER_POLICY`, `X_FRAME_OPTIONS = DENY`. Gating on "not a test run"
  is required because CI runs the suite with `DEBUG=0`; without it every test
  request would 301 to https.

**Frontend security headers (`apps/web`, `apps/admin` `next.config.ts`)**
- Both Next apps send a Content-Security-Policy plus `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, and (prod
  only) HSTS, via `next.config` `headers()`.
- The CSP is built from what the apps actually use: `script-src`/`style-src`
  allow `'unsafe-inline'` (Next's inline hydration on a *static* build — a nonce
  would force dynamic rendering; hash-based SRI is a future strict path),
  `font-src 'self'` (next/font self-hosts), and `connect-src 'self' <API origin>`
  where the API origin is parsed from `NEXT_PUBLIC_API_URL` **at build time**
  (so it must be set in the build env, same as the client fetch inlining).
- `headers()` runs on a Node host (`next start`, Vercel, Railway, …). If either
  app is ever exported to a pure static CDN, replicate the headers at the CDN.

**Logging (`config/settings.py` `LOGGING`, `config/exception_handler.py`)**
- Structured console logging, environment-aware level (`LOG_LEVEL`, INFO in prod).
  `django.request` logs 500 tracebacks; routine 4xx stay quiet.
- A custom DRF exception handler turns any unexpected exception into a generic
  `500 {"detail": "A server error occurred.", "reference": "<id>"}` — never a
  stack trace or message — and logs the exception with that same reference for
  tracing. Admin `401`/`403` responses are logged as warnings (method + path
  only).
- **Never log secrets or full email addresses.** Newsletter send failures log the
  signup **pk**, not the address; the only PII-in-logs regression was fixed here.

## Known gaps / follow-ups (ordered)

*(Prod settings hardening — `SECRET_KEY` fail-fast + `SECURE_*`/HSTS — is now
implemented; see "Backend hardening" above. It still requires the deploy to set
the env vars in its environment — see the commented block in
`backend/.env.example`.)*

1. **Media exposure:** dev serves `MEDIA_ROOT` openly (unguessable UUID paths,
   dev-only). Before prod: object storage + signed URLs; never proxy uploads
   through `static()`.
2. **Upload content inspection:** the allowlist checks the extension, not the
   bytes. The grading engine already rejects undecodable audio safely; add
   content sniffing if uploads are ever redistributed/served to other users.
3. **Session-expiry UX:** an `AuthError` during submit shows "sign in again"
   but doesn't flip the global auth state; wire it to `signOut()` so the route
   guard redirects.
4. **Refresh-token storage on web** is localStorage (XSS-readable) — the
   mobile web fallback and the owner-only `apps/admin` dashboard both use it.
   Fine for dev / a single-owner internal tool; revisit before a real web launch.
5. **Global anonymous throttle:** per-user throttles exist; consider an
   `AnonRateThrottle` for login/register/google beyond the scoped ones if abuse
   shows.
6. **Request-body size on the small JSON endpoints:** the global
   `DATA_UPLOAD_MAX_MEMORY_SIZE` is 30 MB (needed for grading audio) and also
   covers the waitlist/contact JSON POSTs; the serializer field caps + per-IP
   throttle blunt abuse, but a per-view body limit would be tighter.
7. **Strict CSP:** both Next apps allow `'unsafe-inline'` scripts (static-build
   constraint). Hash-based SRI (`experimental.sri`) is the path to a nonce-free
   strict CSP that keeps static output.

## Rules

- Never weaken `IsAuthenticated`, upload validation, or CORS to "make the app
  work" — the app not reaching the backend is a networking problem
  (docs/troubleshooting.md), not a permissions problem.
- New endpoints: declare permissions explicitly, validate all input in a
  serializer, and add tests for the unauthenticated + cross-user cases in the
  same PR.
- New env vars go in the relevant `.env.example` (backend, mobile, `apps/web`,
  `apps/admin`) with a comment. Real secrets never enter the repo, and never use
  a public prefix (`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*`) — those ship in the client
  bundle by design, so only public identifiers (API URL, OAuth client IDs) belong
  there.
- Never log secrets or full email addresses. Never return a stack trace or raw
  exception in an API response or UI (`config/exception_handler.py` enforces the
  generic 500). See `docs/error-handling.md`.
