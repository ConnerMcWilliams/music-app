# Clarke Coach

Music practice app for Clarke's *Technical Studies*: pick a study, practice it,
record a take, and get a rubric-based grade with coaching feedback.

- `apps/mobile` — Expo (React Native) app. Self-contained package; see
  `apps/mobile/README.md`.
- `apps/web` — Next.js marketing / waitlist website (static landing page; the
  waitlist form posts to the backend). See [`docs/web.md`](docs/web.md).
- `backend` — Django + DRF API (accounts, studies, submissions, grading,
  progress, waitlist). See `backend/README.md` for setup.
- `docs/` — start with [`architecture.md`](docs/architecture.md); the
  mobile↔backend contract is in [`api.md`](docs/api.md), security posture in
  [`security.md`](docs/security.md), and dev-networking issues ("the app can't
  reach the backend") in [`troubleshooting.md`](docs/troubleshooting.md).

Quick start: run the backend with `python manage.py runserver 0.0.0.0:8000`
(never bare `runserver` — devices can't reach loopback), then `pnpm --dir
apps/mobile start`. The website runs with `pnpm web:dev`. Checks:
`pnpm mobile:ci` (mobile), `pnpm web:ci` (website), and
`cd backend && python manage.py test` (API).

## License

This project is source-available for non-commercial use only.

The code is licensed under the PolyForm Noncommercial License 1.0.0. Commercial use is not permitted without explicit written permission from the copyright holder.
