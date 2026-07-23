# Error handling

How failures are surfaced to users and traced by operators, across the public
site (`apps/web`), the owner dashboard (`apps/admin`), and the API (`backend`).
Companion to `docs/security.md`.

## Principles

- **The server is the boundary.** Client validation is usability only; every
  input is re-validated server-side.
- **Never claim success unless it happened.** Forms show success only after the
  server confirms the write.
- **Calm, non-technical, non-blaming copy.** No status codes, stack traces,
  provider names, table names, or env values reach the user.
- **Separate expected from unexpected.** Validation/throttle/auth are handled 4xx;
  everything else is a generic 500 with a traceable reference.

## User-facing form messages

The marketing forms (`WaitlistForm`, `ContactForm`) submit through
`apps/web/lib/formSubmit.ts`, which maps outcomes to:

| Situation | Message |
| --- | --- |
| Invalid email (server `400`, waitlist) | "Enter a valid email address." |
| Invalid input (server `400`, contact) | "Please check the form and try again." |
| Offline (`navigator.onLine === false`) | "You appear to be offline. Check your connection and try again." |
| Rate-limited (`429`) | "Too many attempts. Please wait a moment and try again." |
| Timeout / network / `5xx` | "We couldn't complete your signup right now. Please try again." (contact: "…send your message…") |
| Success | "You're on the list…" / "Message sent." |

Behaviour: the submit button shows a loading label and is disabled during the
request (double-submit guarded); on error the entered email is preserved, focus
moves to the email input, and the error `<p role="alert">` is linked to the input
via `aria-describedby` + `aria-invalid`. A failed contact **notification email**
never fails the request — the message is stored first (see `docs/security.md`).

## API error responses

- Validation → DRF field errors, e.g. `400 {"email": ["Enter a valid email…"]}`.
- Wrong content type → `415`; malformed JSON → `400`; wrong method → `405`.
- Throttled → `429`. Auth → `401` (missing/expired) / `403` (non-staff).
- **Unexpected exception → generic** `500 {"detail": "A server error occurred.",
  "reference": "<id>"}` (`config/exception_handler.py`). The `reference` is a
  short opaque id that also appears in the server log for that failure — safe to
  show, useful for tracing, and it leaks nothing.

## Error pages (Next.js App Router, v16)

Both apps use the framework conventions. `error.tsx` / `global-error.tsx` are
Client Components and use the **`unstable_retry`** prop (v16.2+, not the old
`reset`) for the retry action, and `console.error(error)` the failure.

| File | Purpose |
| --- | --- |
| `app/not-found.tsx` | 404 — back-home + updates links |
| `app/error.tsx` | route-level error boundary — "Try again" + back home |
| `app/global-error.tsx` | replaces root layout when it throws — self-contained (own `<html>/<body>`, inline styles) |
| `app/loading.tsx` | route-transition fallback |

Unauthorized/forbidden in `apps/admin` are handled in-flow (unauthenticated →
redirect to `/login`; non-staff `403` → "This account has no admin access"),
because the real gate is the backend `IsAdminUser`.

## Testing error pages locally

- **404:** visit any unknown path, e.g. `http://localhost:3000/nope`.
- **Route error boundary:** temporarily `throw new Error("boom")` at the top of a
  page component and load it; you should see `error.tsx` with a working "Try
  again". Remove the throw afterwards.
- **Offline form state:** open dev-tools → Network → Offline, submit a form → the
  offline message shows and focus moves to the email field.
- **Honeypot:** in dev-tools, set the hidden `company` input's value and submit →
  the form shows success but the backend stores nothing.
- **Headers/CSP:** run `pnpm --dir apps/web build && pnpm --dir apps/web start`,
  then `curl -sI http://localhost:3000/` and confirm the CSP / HSTS / nosniff
  headers. (CSP only applies to the production `next start` build, not `next dev`.)

## Simulating backend failures

- **Email provider down:** covered by tests that patch `EmailMessage.send` to
  raise — the contact `201` and the stored row/newsletter row are unaffected
  (`contact/tests.py`, `dashboard/tests.py`). A subtler mode is also covered:
  `send()` returning `0` (the backend accepts nothing without raising) is a
  silent non-delivery — it is logged as an error, and for the newsletter it
  counts toward `failed_count`, not `sent`. To try it by hand, point
  `EMAIL_HOST` at an unreachable host; the request still succeeds and the failure
  is logged.
- **Database failure:** the generic-500 path is unit-tested by calling the
  exception handler with an unexpected exception (`config/tests.py`) — asserting a
  generic body + reference and **no** leaked message. With `DEBUG=0`, a real
  unhandled exception returns the same generic body.
- **Rate limit:** post to `/api/waitlist/` more than `THROTTLE_WAITLIST` times in
  an hour (lower the env var to test quickly) → `429`.

## Responding to a failed production deploy

1. **App won't boot** with `ImproperlyConfigured: SECRET_KEY must be set…` →
   set a strong `SECRET_KEY` in the deploy env (`DEBUG=0` requires it).
2. **Every request 301s / redirect loop** → `SECURE_SSL_REDIRECT` is on but TLS
   isn't terminating as expected; ensure the proxy sets `X-Forwarded-Proto=https`
   (trusted via `SECURE_PROXY_SSL_HEADER`), or set `SECURE_SSL_REDIRECT=0` if the
   edge already forces https.
3. **Dashboard/API calls fail at CORS preflight** → add the deployed web/admin
   origins to `CORS_ALLOWED_ORIGINS` and set `CORS_ALLOW_ALL_ORIGINS=0`.
4. **CSP blocks scripts/fetch in the browser console** → the API origin wasn't in
   `connect-src`; it is baked from `NEXT_PUBLIC_API_URL` **at build time**, so set
   it in the build env and rebuild.
5. **500s in production** → find the `reference` id from the user/response in the
   server logs (`config.errors` logger) to locate the traceback.
6. **Admin / DRF browsable-API pages render unstyled** → static wasn't collected;
   `collectstatic` runs at **image-build time** in the `Dockerfile` (see the
   backend README's *Deployment*), so check the build logs and redeploy to
   rebuild the image.
