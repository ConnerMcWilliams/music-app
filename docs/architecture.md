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

## Notation rendering (MusicXML)

Studies carry canonical, machine-readable notation in the backend as
`StudyContent.musicxml` (see `backend/studies/models.py`), served on the study
detail endpoint. The mobile app renders that MusicXML on the Practice and Record
screens.

**Use the existing component — do not write a new renderer.**

- `apps/mobile/src/components/practice/MusicXmlView.tsx` is the notation surface.
  It parses MusicXML and draws the staff with `react-native-svg` (no WebView, no
  native module, works on web too). It is styled pixel-for-pixel like the
  placeholder `MusicView`, so it is a drop-in replacement once notation data
  exists — the layout does not shift when the real notation goes live.
- `apps/mobile/src/lib/musicxml/parseMusicXML.ts` is the dependency-free MusicXML
  reader (`ParsedScore`/`ParsedNote`). It is a deliberate subset (pitches,
  durations, dots, slurs/ties, clef/key/time) — extend it here rather than adding
  an XML-parser dependency, which the Expo dependency graph does not tolerate well.

Current status: `MusicXmlView` is **not yet wired into any screen** because no
study has notation in the database. `MusicView` still renders the static
placeholder phrase. When a study returns non-empty `musicxml`:

1. Fetch the study detail (with `content.musicxml`) via `src/services/api`.
2. Replace `<MusicView exercise={…} />` with
   `<MusicXmlView exercise={…} musicXml={content.musicxml} />` on both
   `src/app/(tabs)/practice.tsx` and the Record screen.

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
