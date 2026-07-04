# Backend

Django + Django REST Framework API for the Clarke trumpet studies app.

This first slice covers **storing studies** and **accounts**: the `Study`
catalog with its `StudyContent` notation, and the `users` app (custom
email-login user model + JWT auth API). Submissions, grading, streaks, and study
ingestion (scraping) come in later changes.

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
| GET    | `/api/auth/me/`               | Authenticated user's profile (auth)            |
| GET    | `/api/studies/`               | List all studies (catalog metadata)           |
| GET    | `/api/studies/?section=2`     | All exercises in the Second Study             |
| GET    | `/api/studies/?section_label=Second%20Study` | Same, by label                 |
| GET    | `/api/studies/<slug>/`        | One study, including its notation content      |
| —      | `/admin/`                     | Add/edit studies and their content             |

`slug` is the study's public id (e.g. `clarke-2-5` = Second Study, exercise 5)
and maps to the mobile app's `Exercise.id`.

## Tests

```bash
python manage.py test
```

## Notes

- **Transposition:** `StudyContent.transposition_semitones` defaults to `-2`
  (B♭ trumpet sounds a major second below the written pitch). Grading must apply
  this offset when comparing detected audio pitches to the written notation.
- **Notation is not yet included.** No openly-licensed machine-readable Clarke
  exists — IMSLP hosts only public-domain *image* PDF scans. The catalog is
  seeded as metadata (with IMSLP provenance on each `StudyContent`); MusicXML
  must be produced by OMR (Audiveris) on the IMSLP scan + manual cleanup in
  MuseScore, then loaded per-exercise. Do **not** use MuseScore.com user uploads
  — they are partial and not open-licensed.
- **Grading reference:** the expected note events used for scoring are derived
  from `StudyContent.musicxml` and will be added as a dedicated model during
  ingestion.
- **CORS:** the Expo web build / dev browser call the API cross-origin. In dev,
  `CORS_ALLOW_ALL_ORIGINS` defaults to on (via `DEBUG`); in production set it to
  `0` and list real origins in `CORS_ALLOWED_ORIGINS`. Native app builds don't
  need CORS.
