# Security

What is enforced today, where it lives, and what is deliberately still open.
This is a working checklist, not a claim that the app "is secure."

## Enforced

**Authentication (backend `users/`, docs/authentication.md)**
- JWT via djangorestframework-simplejwt; HS256 signed with `SECRET_KEY`;
  access 15 min, refresh 7 days, rotation + blacklist on use.
- DRF default permission is `IsAuthenticated`; public endpoints opt out
  explicitly (`AllowAny`: register, login, refresh, study catalog only).
- Login returns one generic message for unknown email / wrong password /
  inactive account (no account enumeration); register/login are throttled.
- Identity always comes from the validated token (`request.user`) — no
  endpoint accepts a client-supplied user id.

**Submissions (backend `grading/`)**
- `POST /api/submissions/` requires authentication and attributes the take to
  the token user; throttled per user (`submissions`, default 20/min).
- Upload validation: non-empty, ≤30 MB, extension allowlist (audio formats
  only). Stored path is server-generated
  (`submissions/<uuid>/take.<sanitized-suffix>`) — never user-controlled.
- There are no submission read/list/update endpoints yet, so there is no
  cross-user read surface to protect (add object-level permission tests the
  day one is added).

**Mobile (`apps/mobile/src/services/`)**
- Tokens live in expo-secure-store (Keychain/Keystore); web falls back to
  origin-scoped localStorage. Never AsyncStorage; never logged.
- One API base URL (`services/api.ts`), one auth attachment point
  (`authClient.authedRequest`); refresh-on-401 happens once, then the session
  is cleared. Logout wipes local tokens even if the server call fails.
- No secrets in the app: every `EXPO_PUBLIC_*` var ships in the JS bundle by
  design, so only the API URL belongs there.

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
   `AnonRateThrottle` for login/register beyond the scoped ones if abuse shows.

## Rules

- Never weaken `IsAuthenticated`, upload validation, or CORS to "make the app
  work" — the app not reaching the backend is a networking problem
  (docs/troubleshooting.md), not a permissions problem.
- New endpoints: declare permissions explicitly, validate all input in a
  serializer, and add tests for the unauthenticated + cross-user cases in the
  same PR.
- New env vars go in `.env.example` (backend and/or mobile) with a comment.
  Real secrets never enter the repo or `EXPO_PUBLIC_*`.
