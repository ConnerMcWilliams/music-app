# Architecture

## Chosen Stack

This project will be a monorepo with:
 - 'apps\mobile': Expo + react native mobile app
 - 'backend': Backend that uses Django / Django rest framework API
 - Postgres as the primary relational database
 - Python grading code in Django backend at first
 - local simple file storage in development
 - S3, Cloudflare R2, or equivalent object storage later
 - Celery/Redis later only when grading jobs need a true async queue

## Why This Stack

The app’s core workflow is:
1. The user chooses a clarke study
2. The student practices it with our techniques
3. The student uploads a recording of them playing it
4. Our backend stores this recording and submission
5. Python grading code analyzes the recording.
6. The app shows score, feedback, and practice history.

Django is chosen because the product logic and grading code are Python-heavy. Expo is chosen because the product needs a mobile recording experience. Postgres is chosen because the app has relational data: users, exercises, submissions, grading results, and streaks.

## Database & Environments

The database is Postgres in every environment. We do **not** self-host the
Postgres server.

- **Development:** Postgres runs locally in Docker (`backend/docker-compose.yml`).
  This keeps dev parity with production (same engine, same version) without
  installing Postgres on the host. SQLite is intentionally not used, to avoid
  dialect drift.
- **Production / hosting:** a **managed Postgres** provider — **Neon or Railway**
  — so there is no database server to patch, back up, or babysit. The Django app
  itself will be deployed on a managed host (Railway/Render/Fly) as well.
- **Configuration:** the app reads a single `DATABASE_URL` connection string
  (parsed with `dj-database-url`). The same code path points at local Docker in
  dev and at Neon/Railway in production — only the env var changes. See
  `backend/.env.example`.

Managed Postgres was chosen over Supabase to keep authentication, file storage,
and data access owned by Django (as described in *Current System Boundaries*)
rather than split across a separate backend-as-a-service. Supabase remains a
viable later option if managing auth/storage in Django becomes a burden.

## Authentication

Accounts and auth are owned by the Django backend (no external auth platform).
The `users` app defines a custom email-login user model (UUID pk) and a JWT API
(`djangorestframework-simplejwt`) with short-lived access tokens and rotating
refresh tokens. The mobile app keeps auth state in a single provider, stores
tokens in Expo SecureStore (never AsyncStorage), and gates protected routes so
session restoration never flashes protected content. Full details — endpoints,
token lifecycle, the account model, secure storage, and env vars — live in
[`authentication.md`](authentication.md).

## User profile & streaks

Identity lives on the account (`users`); everything that accrues as a user
*practices* — the day streak, best streak, studies completed, and running
average score — lives in the `progress` app as a `Profile` model, a `OneToOne`
companion to `AUTH_USER_MODEL`. This keeps account data decoupled from progress
data, as the user model's design intends.

`GET /api/profile/` (authenticated) serves the caller's streak/stats to the
Today and Profile screens; the client derives name, initials, and join date from
`/api/auth/me/`. The stats are live: when a take is graded (`grading` app),
`Profile.record_practice()` folds its real rubric score into the streak and
average for the submitter. Submitting a take **requires authentication**
(`POST /api/submissions/` → 401 without a token): the take is attributed to the
token user, never a client-supplied id, so streaks can't be spoofed and
anonymous uploads can't fill the disk. The mobile record flow sends the token
via `authClient.authedRequest`. Profiles are created lazily on first access, so
no per-user backfill or signal is needed. `Profile` stores only aggregates (no
time-series), so the Profile screen's score-trend chart has no dedicated
endpoint — the app derives the series client-side from the caller's graded
submissions (`GET /api/submissions/`), bucketed by day or week.

The full endpoint table, submission payload contract, and mobile integration
rules live in [`api.md`](api.md); the security posture in
[`security.md`](security.md); dev-networking failures in
[`troubleshooting.md`](troubleshooting.md).

## Current System Boundaries

The mobile app is responsible for:

- Authentication UI
- Exercise selection
- Recording
- Uploading
- Displaying feedback
- Displaying streaks and practice history

The Django backend is responsible for:

- Users and profiles
- Exercises
- Submissions
- Grading results
- Streak calculation
- API endpoints
- Admin tooling

The grading module is responsible for:

- Audio extraction
- Pitch analysis
- Rhythm analysis
- Tempo consistency
- Tone/stability metrics
- Rubric scoring

This is implemented in the `grading` Django app (`backend/grading/`): the
`Submission`/`GradingResult` models and the `GET`/`POST /api/submissions/`
endpoint (POST grades a take; GET lists the caller's own history),
plus a Django-free, NumPy-only engine in `backend/grading/engine/` (decode →
analyse → score). It scores the rubric in [`grading-rubric.md`](grading-rubric.md)
and returns the grade the mobile Results screen renders. v1 is reference-free
for pitch/rhythm/tempo/tone (the client sends a section-level exercise id that
doesn't resolve to one transcribed exercise); the study's MusicXML sets the
Completion target. Compressed device recordings (m4a) decode via PyAV (a default
dependency whose wheel bundles FFmpeg), so no system install is needed. See the
backend README's *Grading* section for setup.

## Notation rendering (MusicXML)

Studies carry canonical, machine-readable notation in the backend as
`StudyContent.musicxml` (see `backend/studies/models.py`), served on the study
detail endpoint. The mobile app renders that MusicXML on the Practice and Record
screens.

**Use the existing component — do not write a new renderer.**

- `apps/mobile/src/components/practice/MusicXmlView.tsx` is the notation surface,
  used on both Practice and Record. It parses MusicXML and draws the staff with
  `react-native-svg` (no WebView, no native module, works on web too), engraved
  two measures per staff line and two lines per page, with page-flip controls for
  longer studies.
- `apps/mobile/src/lib/musicxml/parseMusicXML.ts` is the dependency-free MusicXML
  reader (`ParsedScore`/`ParsedNote`). It is a deliberate subset (pitches,
  durations, dots, slurs/ties, clef/key/time) — extend it here rather than adding
  an XML-parser dependency, which the Expo dependency graph does not tolerate well.

Data flow: the study's MusicXML comes from `@/data` via
`getMusicXmlForExercise(id)`, which looks it up in `MUSICXML_BY_ID` (bundled from
`backend/studies/seed/musicxml/` by `apps/mobile/scripts/gen-musicxml.mjs`). Both
`src/app/(tabs)/practice.tsx` and the Record screen render
`<MusicXmlView exercise={…} musicXml={…} />`; a study without notation falls back
to the card's "notation unavailable" state. When the app moves to a live API,
swap the lookup for the study-detail fetch (`content.musicxml`) — the component
props stay the same.

If a renderer needs capabilities beyond the current subset (beaming, multiple
voices, dynamics, etc.), grow `parseMusicXML` + `MusicXmlView`. Introduce a
WebView-based engine (e.g. OpenSheetMusicDisplay) only if SVG rendering proves
insufficient, and record that decision here first.

## Deferred Decisions

The project will not start with:

- Celery
- Redis
- S3
- Social feeds
- Leaderboards
- Contests
- Separate grading microservice

These may be added later after the first vertical slice works.

## First Vertical Slice

The first implementation milestone is:

A user can sign up, choose a Clarke Study, record or upload a practice file, submit it to Django, receive a basic Python-generated grading result, and view that result in the mobile app.
