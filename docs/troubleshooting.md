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

## Submission fails on device but login/profile work

Symptom: JSON calls (login, profile) reach Django, and the emulator's browser
loads `http://10.0.2.2:8000/api/...`, but pressing Submit logs **nothing** in
Django's terminal and the app shows a network error. The upload dies on the
device before any socket opens.

**Root cause: Expo's `fetch` polyfill can't send a React Native file part.**
Expo SDK replaces the global `fetch` with its WinterCG implementation
(`expo/src/winter/fetch`). Its `convertFormData` only understands string / Blob
/ `bytes()` parts — the classic RN `{ uri, name, type }` file descriptor maps to
nothing and it throws `Unsupported FormDataPart implementation`, which RN
surfaces as a generic failure. So the long-standing "append `{uri,name,type}`
to FormData and fetch it" idiom is **broken under Expo fetch**.

**Fix (already in the code):** on native, `submitTakeForGrading`
(`services/api.ts`) uploads the file by path with **expo-file-system's native
multipart uploader** (`new File(uri).upload(url, { uploadType: MULTIPART,
fieldName: 'audio', parameters, headers })`) instead of `fetch` + `FormData`.
Auth is attached via `authClient.getAccessToken()` (refresh-and-retry on 401).
Web still uses `fetch` (real Blob/FormData work there). Don't "simplify" the
native path back to `fetch(FormData)` — it will silently break again.

A **related, separate** gotcha: RN Android also fails a `fetch` multipart
upload when an `AbortSignal` is attached, so `safeFetch` skips the abort-timeout
for `FormData` bodies (still relevant for the web path). Never attach a
timeout/`signal` to an upload.

### How to diagnose an upload that dies before reaching Django

1. Watch Django's terminal during a submit. A logged `POST /api/submissions/`
   line = it reached the server (look at the status). **No line = it died on
   the device** — a client-side upload problem, not networking.
2. Open `http://10.0.2.2:8000/api/studies/` in the **emulator's** browser. JSON
   there but a failing app submit confirms it's app-side, not the network.
3. Temporarily log the real thrown error in `safeFetch`'s catch and the native
   uploader's catch — the wrapped `NetworkError` hides messages like
   `Unsupported FormDataPart implementation`.

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
