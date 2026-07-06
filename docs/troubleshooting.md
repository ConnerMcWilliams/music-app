# Troubleshooting

## The app can't reach the backend (but the browser can)

Seeing JSON at `http://localhost:8000/api/...` in a browser only proves the
route exists on **loopback**. It does not prove a phone/emulator can reach it,
and a `GET` succeeding says nothing about the `POST` the app sends
(`GET /api/submissions/` returns `405` JSON by design).

Work through this list in order:

1. **What URL is the app calling?** In dev the app logs
   `[api] base URL: http://…` on startup (Metro console). If it's not the URL
   you expect, fix the source: `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`
   overrides everything (delete/fix it if stale — a placeholder like
   `https://example.invalid` silently breaks every call); otherwise the host is
   derived from the Metro dev server.
2. **Is Django bound to all interfaces?** Run
   `python manage.py runserver 0.0.0.0:8000` — the default `runserver` binds
   `127.0.0.1` and refuses every connection from a device, while the browser on
   the dev machine still works. Quick check from another machine/phone browser:
   `http://<LAN-ip>:8000/api/studies/`.
3. **Can the device reach the dev machine at all?** Phone and machine must be
   on the same LAN; hotel/campus/guest Wi-Fi often isolates clients. Firewalls
   (Windows Defender!) block inbound 8000 by default.
4. **WSL2:** the Linux VM has its own NAT'd IP (`172.x.x.x`) that phones cannot
   reach. Either run with WSL *mirrored networking* mode, or forward the port
   on the Windows side (PowerShell as admin):
   `netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=<WSL-ip>`
   and open the Windows firewall for 8000. Android emulator: `10.0.2.2:8000`
   reaches the *Windows* loopback, which auto-forwards into WSL.
5. **Expo tunnel mode breaks the derived API host.** With `expo start
   --tunnel`, the Metro host is an `exp.direct` domain — the app would derive
   `http://….exp.direct:8000`, which is not your machine. Set
   `EXPO_PUBLIC_API_URL=http://<LAN-ip>:8000` explicitly when using tunnels.
6. **What did the app actually get back?** The Record screen now distinguishes:
   *"Couldn't reach the grading service…"* = network layer (steps 1–5);
   a specific message (e.g. *"Audio file is too large"*, *"session has
   expired"*) = the request **did** reach Django — read the message. Dev builds
   also `console.warn` the HTTP status + detail for failed submissions.

### Dev URL matrix

| App runs on       | Backend URL the app needs                           |
| ----------------- | --------------------------------------------------- |
| Android emulator  | `http://10.0.2.2:8000` (auto-remapped by the app)    |
| iOS simulator     | `http://localhost:8000`                              |
| Physical device   | `http://<dev-machine-LAN-ip>:8000`                   |
| Expo web          | `http://localhost:8000`                              |

The app derives these automatically from the Metro host when
`EXPO_PUBLIC_API_URL` is unset (`apps/mobile/src/services/api.ts`).

## Submission returns 4xx

- `401` — no/expired token. The app refreshes once automatically; a persistent
  401 means the session is gone: sign in again.
- `400 {"audio": …}` — empty file, >30 MB, or a disallowed extension (see
  allowlist in `backend/grading/serializers.py`).
- `429` — submission throttle (default 20/min per user).

## Backend starts but every request 400s ("Bad Request")

`DEBUG=0` with unset `ALLOWED_HOSTS`. In dev set `DEBUG=1`
(`backend/.env`, from `.env.example`); in prod set `ALLOWED_HOSTS`.

## Submission fails instantly on Android ("Network request failed")

React Native's Android networking fails a **multipart upload immediately when
an AbortSignal is attached** — the request never leaves the device, while JSON
calls (auth/profile) keep working, so it looks like a backend outage. That is
why `safeFetch` (`services/auth/client.ts`) skips the abort-based timeout for
`FormData` bodies. Never re-add a timeout/`signal` to the upload request.

## m4a/aac/mp3 uploads grade as "length-only"

The audio decoder is missing. `av` (PyAV) is a core backend dependency —
reinstall the environment (`pip install -e ".[dev]"` or `uv sync`). WAV
decodes via the stdlib regardless; a system `ffmpeg` on PATH is a fallback.

## Backend tests fail: no Postgres

`DATABASE_URL=sqlite:///test.sqlite3 python manage.py test` — the suite runs on
SQLite; CI runs it on Postgres.

## Typecheck fails on route strings (`"/login"` not assignable…)

Stale generated route types (`.expo/types/router.d.ts`). Run `expo start` once
(typed routes regenerate on dev-server start) and re-run `pnpm typecheck`.
