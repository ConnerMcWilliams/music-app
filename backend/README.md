# Backend

Django + Django REST Framework API for the Clarke trumpet studies app.

This slice covers **studies**, **accounts**, **grading**, **practice
progress**, and the **marketing-site waitlist**: the `Study` catalog with its
`StudyContent` notation, the `users` app (custom email-login user model + JWT
auth API), the `grading` app (upload a take → score it against the rubric →
store and return the grade), the `progress` app (per-user day streak + aggregate
stats + the XP/level/coin reward economy), and the `waitlist` app (public
email-capture endpoint for the `apps/web` signup form). Study ingestion
(scraping) comes in a later change.

For the authentication design — endpoints, token lifecycle, the custom user
model, secure storage, and environment variables — see
[`docs/authentication.md`](../docs/authentication.md).

## Stack

- Django + DRF
- Postgres (local via Docker in dev; managed Postgres — Neon/Railway — in prod)
- Config via a single `DATABASE_URL` (see `docs/architecture.md`)

## Prerequisites

- Python 3.11+
- Docker (for the local Postgres) — or any Postgres reachable via `DATABASE_URL`

## Setup

```bash
cd backend

# 1. Python environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# 2. Environment variables
cp .env.example .env             # edit SECRET_KEY etc. as needed

# 3. Start the local Postgres
docker compose up -d db

# 4. Apply migrations
python manage.py migrate

# 5. Load the Clarke Technical Studies catalog (190 exercises, 10 sections)
python manage.py import_clarke

# 6. (optional) Create an admin user to edit studies via /admin/
python manage.py createsuperuser

# 7. Run the API — bind all interfaces, NOT the default 127.0.0.1.
# A phone/emulator can only reach the dev machine over its LAN IP; a
# loopback-bound server answers the browser on this machine but refuses
# every device connection (see docs/troubleshooting.md).
python manage.py runserver 0.0.0.0:8000
```

## Importing the Clarke catalog

`import_clarke` seeds all 190 exercises of Clarke's *Technical Studies*, grouped
into the 10 Studies. It is idempotent (matches on `slug`, so re-running updates
rather than duplicates) and reads its data from `studies/seed/clarke.py`.

```bash
python manage.py import_clarke            # create/update everything
python manage.py import_clarke --dry-run  # show changes, write nothing
python manage.py import_clarke --clear    # delete Clarke rows first (dev/reseed)
```

> **Deploy note:** the reward system added `Study.difficulty` (drives per-study
> XP value). The migration defaults it to `1`, so **existing databases must
> re-run `import_clarke` after migrating** to backfill each study's real
> difficulty (from its Clarke section) — otherwise every study is worth the
> minimum XP. Fresh installs seed it correctly on the first import. Use the plain
> re-import (it upserts by `slug`); **do not use `--clear`** for this — see below.

> **`--clear` is dev/reseed only.** It deletes and recreates the Study rows, and
> `Submission.study` is `on_delete=SET_NULL`, so every existing take loses its
> study link and its per-study XP cap resets to 0 (users could re-mine the
> catalog's XP). The command therefore **refuses `--clear` when graded
> submissions are linked to Clarke studies** unless you pass `--force`.

Only the 11 capstone études carry a verified key/tempo; the other exercises are
catalogued with correct section/number/provenance and **blank notation**, to be
filled in as they are transcribed (see *Notes*).

## API

| Method | Path                          | Description                                   |
| ------ | ----------------------------- | --------------------------------------------- |
| POST   | `/api/auth/register/`         | Create an account (public)                     |
| POST   | `/api/auth/login/`            | Email+password → JWT pair (public)             |
| POST   | `/api/auth/google/`           | Google ID token → JWT pair (public)            |
| POST   | `/api/auth/refresh/`          | Rotate refresh → new access token              |
| POST   | `/api/auth/logout/`           | Blacklist a refresh token (auth)               |
| GET    | `/api/auth/me/`               | Authenticated user's account (auth)            |
| GET    | `/api/studies/`               | List all studies (catalog metadata)           |
| GET    | `/api/studies/?section=2`     | All exercises in the Second Study             |
| GET    | `/api/studies/?section_label=Second%20Study` | Same, by label                 |
| GET    | `/api/studies/<slug>/`        | One study, including its notation content      |
| POST   | `/api/submissions/`           | Upload a take (multipart audio) → graded result |
| GET    | `/api/submissions/`           | Caller's own take history (paginated, auth)    |
| GET    | `/api/profile/`               | Current user's streak, stats + rewards (auth)  |
| GET    | `/api/profile/study-scores/`  | Best analyzed score per study + pass flag (auth) |
| POST   | `/api/profile/streak-freeze/` | Spend coins on one streak freeze (auth)        |
| POST   | `/api/waitlist/`              | Marketing-site signup (public, throttled per IP) |
| —      | `/admin/`                     | Add/edit studies, content, and profiles        |

`slug` is the study's public id (e.g. `clarke-2-5` = Second Study, exercise 5)
and maps to the mobile app's `Exercise.id`.

## Practice progress & streaks

The `progress` app owns each user's **practice streak**, aggregate stats, and
**reward economy**. Its `Profile` model is a `OneToOne` companion to
`AUTH_USER_MODEL` (identity stays in `users`) holding `day_streak`,
`longest_streak`, `last_active_date`, `studies_completed`, a running
`avg_score`, plus `xp_total`, `coins`, and `streak_freezes`. Profiles are
created lazily on first access (`Profile.for_user`).

`GET /api/profile/` (authenticated) returns the caller's streak/stats and reward
state (XP, derived level + rank title, coins, freezes — see `docs/api.md`). The
mobile app reads it for the Today and Profile screens and derives the user's
name, initials, and join date from the account (`/api/auth/me/`).

`GET /api/profile/study-scores/` (authenticated) returns the caller's best
**analyzed** score per study — one row per resolved `Submission.study` slug —
with a `passed` flag against the passing bar (`grading.models.PASSING_SCORE`,
currently 70) and the threshold itself echoed so clients never hardcode it.
The mobile app walks its catalog order against these rows to surface the first
unpassed study on the Today card (see `docs/api.md`).

The numbers are **live, not constants**: when a take is submitted for grading,
`grading.SubmissionListCreateView` calls `Profile.record_practice(...)` with the
take's real rubric score. It advances the streak (same-day no-op, +1 if the last
practice was yesterday; on a longer gap held streak freezes are consumed — one
per missed day — to bridge it, otherwise reset to 1), increments studies
completed, folds the score into the average, and awards XP/coins (see
*Rewards* below). Submission requires authentication
(`POST /api/submissions/` returns 401 without a valid token), so every take is
attributed to its submitter and every graded take counts. `Profile` stores only
these aggregates, no time-series, so the Profile screen's score-trend chart has
no dedicated endpoint — the app derives it client-side from the caller's graded
submissions (`GET /api/submissions/`), bucketed by day or week.

### Rewards (XP · levels · coins · streak freezes)

The tuning lives in `progress/rewards.py` (pure, DB-free, unit-tested). Each
study is worth `difficulty × 100` XP — `Study.difficulty` tracks the Clarke
section (I–X → 1–10) and the capstone études are `section + 15`, so
~1,600–2,500 XP each. A graded take earns XP **only when it beats the caller's
prior best** on that study, and it pays the improvement —
`(new_best% − old_best%) / 100 × value` — so a study's lifetime yield is capped
at `best% × value` and replaying can't farm XP. Length-only grades (undecodable
audio, `GradingResult.analyzed=False`) earn no XP and don't set a best; the XP
each take paid is stored on its `GradingResult.xp_awarded`. Lifetime `xp_total`
derives the level (quadratic curve) and rank title; crossing a level grants
coins — the only coin source. Coins buy streak freezes
(`POST /api/profile/streak-freeze/`, capped at 3 held), each bridging one
missed practice day. The grading view takes a row lock
(`Profile.lock_for_user`) before reading the prior best, so concurrent uploads
can't double-pay the same improvement.

## Tests

```bash
python manage.py test

# No local Postgres (e.g. plain WSL)? The suite also runs on SQLite:
DATABASE_URL=sqlite:///test.sqlite3 python manage.py test
```

## Grading

The `grading` app scores an uploaded take against the rubric in
[`docs/grading-rubric.md`](../docs/grading-rubric.md) — **Pitch 25 · Rhythm 25 ·
Tempo 20 · Tone 15 · Completion 15**, out of 100.

- **Engine** (`grading/engine/`) is a dependency-light, Django-free pipeline:
  `audio.py` decodes to mono PCM → `analysis.py` extracts pitch (FFT
  autocorrelation), note onsets (spectral flux) and a loudness envelope →
  `rubric.py` scores the five categories and writes coaching feedback.
  `reference.py` reads the study's MusicXML for a real Completion target. NumPy
  is the only third-party dependency.
- **v1 is deliberately reference-free** for pitch/rhythm/tempo/tone: it judges
  the recording's intrinsic steadiness and in-tune-ness (a slow steady take
  beats a fast sloppy one), because the client sends a section-level id (e.g.
  `clarke-2`) that doesn't uniquely resolve to one transcribed exercise.
  Note-level alignment against the notation is future work.
- **Audio formats:** all common formats decode out of the box. `av` (PyAV) is a
  default dependency and bundles FFmpeg in its wheel, so device recordings
  (m4a/aac/mp3) grade fully with **no system install**. WAV also decodes via the
  stdlib, and a system `ffmpeg` on `PATH` is used as a fallback if present. If a
  file can't be decoded at all, the response is a clearly-labelled, length-only
  grade rather than a fabricated one.
- **Storage:** takes are saved under `MEDIA_ROOT` (`media/` in dev; object
  storage swaps in via `DEFAULT_FILE_STORAGE` later). `Submission` +
  `GradingResult` rows persist every take and its grade.

## Notes

- **Transposition:** `StudyContent.transposition_semitones` defaults to `-2`
  (B♭ trumpet sounds a major second below the written pitch). Grading must apply
  this offset when comparing detected audio pitches to the written notation.
- **Notation:** 132 of the 190 exercises ship as generated MusicXML in
  `studies/seed/musicxml/` (Studies I–VI complete plus Study IX Nos. 178–183).
  Because Clarke's pattern exercises are formulas (a figure transposed through
  keys), the notation is *generated*: the public-domain 1912 Carl Fischer scan
  was read page-by-page (notehead detection + visual verification — see
  `scripts/generate_clarke_musicxml.py` and `studies/seed/clarke_notation.py`)
  and each study's scheme encoded exactly as engraved. Load with
  `python manage.py import_clarke_notation`.
- **Still pending transcription** (58): the 10 études/melodies (Nos. 26, 45,
  65, 86, 117, 132, 170, 177, 189, 190), Study VII (133–169), Study VIII
  (171–176), Study IX Nos. 184–186 and Study X Nos. 187–188 — these are
  through-composed or accidental-dense triplet forms that need note-level
  transcription rather than formula generation. Do **not** use MuseScore.com
  user uploads — they are partial and not open-licensed.
- **Grading reference:** the expected performance (note count + duration) is
  derived at grade time from `StudyContent.musicxml` by `grading/engine/
  reference.py`; it feeds the Completion score. Note-level pitch/rhythm
  reference alignment is future work (see the `grading` app).
- **CORS:** the Expo web build / dev browser and the `apps/web` marketing site
  (its waitlist form) call the API cross-origin. In dev, `CORS_ALLOW_ALL_ORIGINS`
  defaults to on (via `DEBUG`); in production set it to `0` and list real origins
  in `CORS_ALLOWED_ORIGINS` (including the marketing site's domain). Native app
  builds don't need CORS.
