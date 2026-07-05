# Backend

Django + Django REST Framework API for the Clarke trumpet studies app.

This slice covers **storing studies**, **accounts**, and **practice progress**:
the `Study` catalog with its `StudyContent` notation, the `users` app (custom
email-login user model + JWT auth API), and the `progress` app (per-user day
streak + aggregate stats). Real grading and study ingestion (scraping) come in
later changes.

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

# 7. Run the API
python manage.py runserver
```

## Importing the Clarke catalog

`import_clarke` seeds all 190 exercises of Clarke's *Technical Studies*, grouped
into the 10 Studies. It is idempotent (matches on `slug`, so re-running updates
rather than duplicates) and reads its data from `studies/seed/clarke.py`.

```bash
python manage.py import_clarke            # create/update everything
python manage.py import_clarke --dry-run  # show changes, write nothing
python manage.py import_clarke --clear    # delete existing Clarke rows first
```

Only the 11 capstone études carry a verified key/tempo; the other exercises are
catalogued with correct section/number/provenance and **blank notation**, to be
filled in as they are transcribed (see *Notes*).

## API

| Method | Path                          | Description                                   |
| ------ | ----------------------------- | --------------------------------------------- |
| POST   | `/api/auth/register/`         | Create an account (public)                     |
| POST   | `/api/auth/login/`            | Email+password → JWT pair (public)             |
| POST   | `/api/auth/refresh/`          | Rotate refresh → new access token              |
| POST   | `/api/auth/logout/`           | Blacklist a refresh token (auth)               |
| GET    | `/api/auth/me/`               | Authenticated user's account (auth)            |
| GET    | `/api/studies/`               | List all studies (catalog metadata)           |
| GET    | `/api/studies/?section=2`     | All exercises in the Second Study             |
| GET    | `/api/studies/?section_label=Second%20Study` | Same, by label                 |
| GET    | `/api/studies/<slug>/`        | One study, including its notation content      |
| POST   | `/api/submissions/`           | Submit a take for grading (auth)               |
| GET    | `/api/profile/`               | Current user's streak + stats (auth)           |
| —      | `/admin/`                     | Add/edit studies, content, and profiles        |

`slug` is the study's public id (e.g. `clarke-2-5` = Second Study, exercise 5)
and maps to the mobile app's `Exercise.id`.

## Practice progress & streaks

The `progress` app owns each user's **practice streak** and aggregate stats. Its
`Profile` model is a `OneToOne` companion to `AUTH_USER_MODEL` (identity stays in
`users`) holding `day_streak`, `longest_streak`, `last_active_date`,
`studies_completed`, and a running `avg_score`. Profiles are created lazily on
first access (`Profile.for_user`).

`GET /api/profile/` (authenticated) returns the caller's streak/stats. The mobile
app reads it for the Today and Profile screens and derives the user's name,
initials, and join date from the account (`/api/auth/me/`).

The numbers are **live, not constants**: `Profile.record_practice(score)` runs on
every graded take (from `SubmissionCreateView`, which now requires authentication
so a take is attributed to a user). It advances the streak (same-day no-op, +1 if
the last practice was yesterday, otherwise reset to 1), increments studies
completed, and folds the score into the average. The score-trend chart on the
Profile screen is not served yet — the app renders a placeholder series until
that endpoint exists.

## Tests

```bash
python manage.py test
```

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
- **Grading reference:** the expected note events used for scoring are derived
  from `StudyContent.musicxml` and will be added as a dedicated model during
  ingestion.
- **CORS:** the Expo web build / dev browser call the API cross-origin. In dev,
  `CORS_ALLOW_ALL_ORIGINS` defaults to on (via `DEBUG`); in production set it to
  `0` and list real origins in `CORS_ALLOWED_ORIGINS`. Native app builds don't
  need CORS.
