# Backend

Django + Django REST Framework API for the Clarke trumpet studies app.

This slice covers **studies**, **accounts**, **grading**, **practice
progress**, the **marketing-site waitlist and contact forms**, and the
**owner-only admin dashboard**: the `Study` catalog with its `StudyContent`
notation, the `users` app (custom email-login user model + JWT auth API, the
onboarding answers each player gives, plus a one-time welcome email when a player
finishes onboarding), the `grading` app (upload a take → score it against the rubric → store and return
the grade), the `progress` app (per-user day streak + aggregate stats + the
XP/level/coin reward economy), the `waitlist` app (public email-capture endpoint
for the `apps/web` signup form, a one-time welcome email to new signups, plus a
signed one-click newsletter unsubscribe link), the `contact` app (public message endpoint for the `apps/web` contact
form that also emails the site owner), the `analytics` app (a public,
privacy-light page-visit endpoint for the marketing site that supplies the
conversion-rate denominator), the `dashboard` app (staff-only signup and
conversion analytics, waitlist browsing, and newsletter sending), and the
`updates` app (owner-published posts served to the site's `/updates` page). The
`dashboard` and `updates` apps power the `apps/admin` dashboard — see
[`docs/admin.md`](../docs/admin.md). Study ingestion (scraping) comes in a later
change.

For the authentication design — endpoints, token lifecycle, the custom user
model, secure storage, and environment variables — see
[`docs/authentication.md`](../docs/authentication.md).

## Stack

- Django + DRF
- Postgres (local via Docker in dev; managed Postgres — Neon/Railway — in prod)
- Config via a single `DATABASE_URL` (see `docs/architecture.md`)
- gunicorn (production WSGI) + WhiteNoise (serves static from the app process);
  see *Deployment*

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

## Deployment

The backend ships a Railway deploy config (`railway.json`) and a `Dockerfile`,
portable in spirit to Render/Fly. In production the app is served by **gunicorn**
(`gunicorn config.wsgi`) behind the platform's TLS-terminating proxy, and
**WhiteNoise** serves the collected static assets (Django admin + DRF browsable
API) straight from the app process, so no separate static host/CDN is needed.
Media (uploaded grading audio) stays on local disk — object storage is a later
step (see *Grading → Storage* and `docs/architecture.md`).

The image builds from `Dockerfile` (`railway.json` sets `builder: DOCKERFILE`),
not Railway's Nixpacks autodetection. Nixpacks runs `pip install .` before the
full source tree is in place, and this app's `pyproject.toml` declares itself a
setuptools package, so the wheel build fails there with `package directory
'config' does not exist`. The Dockerfile copies the whole source first, **then**
`pip install .`, so every package directory exists when the wheel builds.
`psycopg[binary]` and `av` (PyAV) ship self-contained binary wheels, so no `apt`
packages (libpq, ffmpeg) are needed. `.dockerignore` keeps the build context and
image lean (excludes `.venv/`, `__pycache__/`, `staticfiles/`, `media/`,
`db.sqlite3`, `.env`, `.git/`). On Railway, set the service **Root Directory** to
`backend` so this Dockerfile is found.

`collectstatic` runs at **image-build time** (a `RUN` in the Dockerfile), baking
the hashed assets into the image for WhiteNoise to serve — it needs no database
and no real `SECRET_KEY` (it's an exempt management command), and `DEBUG` defaults
off so the manifest storage runs.

`railway.json` splits the runtime deploy in two:

- **`preDeployCommand`** runs `migrate` once, before the new release rolls out —
  it touches the shared database, so it must not run per-container.
- **`startCommand`** launches gunicorn with `-c gunicorn.conf.py`, which holds
  the runtime tuning (see below).

`gunicorn.conf.py` reads the listen port from `$PORT` in Python
(`bind = f"0.0.0.0:{PORT}"`, default 8080) rather than a `--bind 0.0.0.0:$PORT`
flag: Railway runs the `startCommand` **without a shell**, so a literal `$PORT`
would reach gunicorn unexpanded and be rejected as an invalid port. Reading it in
Python sidesteps that. The same file sets the worker count (2, override with
`WEB_CONCURRENCY`), a 120s `timeout` (so long CPU-heavy grading requests aren't
killed by gunicorn's 30s default), and stdout access logs for the platform's log
drain.

Static uses `CompressedManifestStaticFilesStorage` (compressed, content-hashed,
manifest-based) so assets carry far-future cache headers. The manifest backend is
active only when `DEBUG=0`; dev keeps the plain backend so `runserver` works
without a hand-run `collectstatic` (`staticfiles/` is gitignored).

Set the production environment before the first deploy — at minimum a strong
`SECRET_KEY` (a served boot fails fast if it's still the dev default), `DEBUG=0`,
`DATABASE_URL` (managed Postgres), `ALLOWED_HOSTS`, and the CORS origins. See
`.env.example` for the full list and the HTTPS-hardening block.

## API

| Method | Path                          | Description                                   |
| ------ | ----------------------------- | --------------------------------------------- |
| POST   | `/api/auth/register/`         | Create an account (public)                     |
| POST   | `/api/auth/login/`            | Email+password → JWT pair (public)             |
| POST   | `/api/auth/google/`           | Google ID token → JWT pair (public)            |
| POST   | `/api/auth/refresh/`          | Rotate refresh → new access token              |
| POST   | `/api/auth/logout/`           | Blacklist a refresh token (auth)               |
| GET    | `/api/auth/me/`               | Authenticated user's account (auth)            |
| GET/PATCH | `/api/preferences/`        | Caller's onboarding answers; PATCH saves one step (auth) |
| GET    | `/api/studies/`               | List all studies (catalog metadata)           |
| GET    | `/api/studies/?section=2`     | All exercises in the Second Study             |
| GET    | `/api/studies/?section_label=Second%20Study` | Same, by label                 |
| GET    | `/api/studies/<slug>/`        | One study, including its notation content      |
| POST   | `/api/submissions/`           | Upload a take (multipart audio) → graded result |
| GET    | `/api/submissions/`           | Caller's own take history (paginated, auth)    |
| GET    | `/api/submissions/<uuid>/`    | One of the caller's takes, incl. per-note verdicts (auth) |
| GET    | `/api/profile/`               | Current user's streak, stats + rewards (auth)  |
| GET    | `/api/profile/study-scores/`  | Best analyzed score per study + pass flag (auth) |
| POST   | `/api/profile/streak-freeze/` | Spend coins on one streak freeze (auth)        |
| POST   | `/api/waitlist/`              | Marketing-site signup (public, throttled per IP) |
| GET    | `/api/waitlist/unsubscribe/`  | One-click newsletter opt-out (public, signed `?token=`) |
| POST   | `/api/contact/`               | Marketing-site contact message (public, throttled per IP) |
| POST   | `/api/site/visit/`            | Anonymous marketing-site page-visit beacon (public, throttled per IP) |
| GET    | `/api/dashboard/analytics/`   | Signup + waitlist + conversion analytics (staff only)       |
| GET    | `/api/dashboard/waitlist/`    | Browse/filter waitlist signups (staff only)    |
| GET/POST | `/api/dashboard/newsletters/` | Send history / compose + send a newsletter (staff only) |
| GET/POST | `/api/updates/manage/`      | List/create update posts incl. drafts (staff only) |
| GET/PATCH/DELETE | `/api/updates/manage/<pk>/` | Read/edit/delete one update post (staff only) |
| GET    | `/api/updates/`               | Published update posts for `apps/web` (public, throttled per IP) |
| —      | `/admin/`                     | Add/edit studies, content, profiles, and player preferences |

`slug` is the study's public id (e.g. `clarke-2-5` = Second Study, exercise 5)
and maps to the mobile app's `Exercise.id`. The staff-only `dashboard`/`updates`
endpoints (gated with DRF `IsAdminUser`, i.e. `User.is_staff`) and the newsletter
mechanics are documented in [`docs/admin.md`](../docs/admin.md).

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
- **Note-level grading** runs when the take resolves to exactly one transcribed
  exercise (the client sends an exercise-level slug, e.g. `clarke-2-5`):
  `timeline.py` reads the notation into expected notes, `segment.py` groups the
  pitch track into performed notes, and `align.py` pairs the two, so Pitch and
  Rhythm are scored note-by-note and the app can colour each note. Tempo and
  Tone stay reference-free, and Pitch/Rhythm fall back to the reference-free
  scorers whenever the match can't be trusted — the conditions and the wire flag
  are in [`docs/grading-rubric.md`](../docs/grading-rubric.md).
- **Audio formats:** all common formats decode out of the box. `av` (PyAV) is a
  default dependency and bundles FFmpeg in its wheel, so device recordings
  (m4a/aac/mp3) grade fully with **no system install**. WAV also decodes via the
  stdlib, and a system `ffmpeg` on `PATH` is used as a fallback if present. If a
  file can't be decoded at all, the response is a clearly-labelled, length-only
  grade rather than a fabricated one.
- **Storage:** takes are saved under `MEDIA_ROOT` (`media/` in dev; object
  storage swaps in via `STORAGES["default"]` later). `Submission` +
  `GradingResult` rows persist every take and its grade.

## Notes

- **Transposition:** `StudyContent.transposition_semitones` defaults to `-2`
  (B♭ trumpet sounds a major second below the written pitch). Grading applies it
  in exactly one place — `grading/engine/timeline.py`, when the written notation
  becomes expected sounding pitches — so anything comparing detected audio to
  the notation must go through that timeline rather than re-applying the offset.
- **Notation:** 169 of the 190 exercises ship as generated MusicXML in
  `studies/seed/musicxml/` (Studies I–VII complete bar the étude, and Study IX
  Nos. 178–183).
  Because Clarke's pattern exercises are formulas (a figure transposed through
  keys), the notation is *generated*: the public-domain 1912 Carl Fischer scan
  was read page-by-page (notehead detection + visual verification — see
  `scripts/generate_clarke_musicxml.py` and `studies/seed/clarke_notation.py`)
  and each study's scheme encoded exactly as engraved. Load with
  `python manage.py import_clarke_notation`.
- **Clef:** every file is treble (`<sign>G</sign><line>2</line>`), asserted by
  `NotationImportTests.test_every_exercise_is_treble_clef`. music21 picks a clef
  from the pitch range unless told, which had silently put the five
  lowest-starting exercises into bass clef; the mobile renderer paints a treble
  glyph regardless, so those drew bass-clef positions under a treble staff.
  `generate_clarke_musicxml.py` now appends `clef.TrebleClef()` explicitly, and
  `stabilize()` pins the part id and drops the encoding date so regeneration is
  byte-reproducible and its diffs are reviewable.
- **Study VII Nos. 133–150** are the 12/8 block, encoded by
  `build_study7_neighbours()`. Nine bars, no repeat: sixteen neighbour groups of
  three eighths (eight ascending `(M, M−1, M)` with M climbing chromatically
  from the tonic, a turn at `tonic+8`, then seven descending `(M, M+1, M)`),
  then I, IV, I, V7, I arpeggios two to a bar and a closing dotted half under a
  fermata. Each exercise starts a semitone higher, G3 through C5; the key
  signatures were read off the scan one by one, not assumed.

  Spelling follows the harmonic chromatic scale (every inflected degree flat
  except the raised fourth), except that the descent closes on a raised tonic;
  where that would force a double accidental the note drops to the sharp-side
  letter. That reproduces the engraving exactly in every key the scan was read
  twice for (G and B♭ both appear at two octaves, and both matched 102/102
  noteheads), and 95.4% overall against a notehead reader that is itself
  imperfect — the residue is enharmonic respelling, never a different pitch.
  `NotationImportTests.test_study7_first_exercise_matches_the_scan` pins the
  spelling, not just the pitches.
- **Study VII Nos. 151–157** are the arpeggio block, encoded by
  `build_study7_arpeggios()`. Every note is diatonic — the scan writes no
  accidental in the body — so the key signature alone spells them. Eight
  twelve-note groups, each climbing seven chord tones and returning down the
  middle five, in the order I I IV IV I I V7 V7, under a repeat, then a closing
  fermata half note. Nos. 151–154 are common time and pack two groups to a bar
  as **sixteenth triplets** (24 notes per bar); Nos. 155–157 are 6/8 and give
  each group its own bar of plain sixteenths. The dominant-seventh groups enter
  a scale degree above the others, which is what puts the seventh in the bar.
  Matched the scan 97.3% overall by notehead position, No. 152 exactly (96/96).
- **Study VII Nos. 158–169** are the diminished-seventh block, encoded by
  `build_study7_diminished()`. Twelve short exercises, one staff system each,
  no key signature — every accidental is written in the body. Each arpeggiates
  a single diminished seventh up and down twice under a repeat, then a whole-bar
  fermata note on the root; the 2/4 ones climb nine notes and return seven, the
  3/4 ones climb ten and return eight. Roots climb chromatically F♯3→C4 with
  Clarke's own repeats. Because a diminished seventh has only three
  transpositions, several of these sound alike and differ in **spelling** — No.
  163 is G♯–B–D–F and No. 164 the same chord written A♭–C♭–D–F — so the letters
  are read off the scan rather than derived. Matched 95.8% by notehead position,
  five of the twelve exactly.
- **Still pending transcription** (21): the 10 études/melodies (Nos. 26, 45,
  65, 86, 117, 132, 170, 177, 189, 190), Study VIII (171–176), Study IX
  Nos. 184–186 and Study X Nos. 187–188. Do **not** use MuseScore.com user
  uploads — they are partial and not open-licensed. Decoded from the scan,
  these split into two groups:
  - **Sixteenth-note triplet studies** — Study VIII (171–176) and Study IX
    Nos. 184–186 are engraved in 2/4 with explicit **triplets**. Both ends of
    the pipeline now handle these: the generator emits `<time-modification>`
    and the brackets from a `Fraction` duration (`TRIPLE_16TH`), and the mobile
    renderer draws them. What is still missing is a verified transcription. Decoded from the scan so far, for Study VIII:
    2/4, ♩=92, *pp*, six exercises climbing chromatically **G, A♭, A, B♭, B, C**
    (one per printed page-half, five staff systems each), 12 sixteenth-triplets
    per bar, 16 bars under a repeat plus a closing bar of six triplets and a
    fermata quarter. The figure is a lower-neighbour climb `(X, X−1, X)` with X
    ascending chromatically, a turn at the top, an upper-neighbour descent
    `(X, X+1, X)`, then a chromatic scale up 24 and down 24, then a two-octave
    major arpeggio. **Not yet pinned:** the exact climb/descent split and the
    accidental spelling convention — fitting the section lengths against the
    scan tops out around 91% agreement, well below the 97–100% the shipped
    corpus was verified at, so these are deliberately not generated yet.

    Finish them the way Study VII was finished, which is *not* by fitting
    structure to the notehead reader. Read one exercise's systems at high
    magnification to pin the figure and the accidentals; take the key ladder
    from the engraved key signatures; then let the template supply pitch and the
    notehead reader supply staff position, since the reader is blind to
    accidentals but accurate about position, and the two together determine the
    notation completely. Cross-check with a key that appears twice — agreement
    there separates a real spelling difference from reader noise.

    Tuplets are expressed as durations, not flags: an event whose
    quarterLength is `TRIPLE_16TH` (`Fraction(1, 6)`) makes music21 derive the
    3:2 `<time-modification>` and the bracket markers itself.
  - **Blocked on grace notes, and not formulaic** — Study X Nos. 187–188 are a
    through-composed arpeggio *melody* using "small notes (Sotto Voce)" against
    accented large notes. These belong with the études, not the pattern batch.
- **Layout ceiling:** `layout.ts` never splits a measure across systems and needs
  ≥10.5 units between note centres over a 244-unit line, capping a measure at
  ~23 notes. The corpus maxes out at 16 today; check bar density before encoding
  anything new.
- **Grading reference:** the expected performance (note count + duration) is
  derived at grade time from `StudyContent.musicxml` by `grading/engine/
  reference.py`; it feeds the Completion score. The same MusicXML drives
  note-level pitch/rhythm alignment via `grading/engine/timeline.py` (see
  *Grading* above).
- **CORS:** the Expo web build / dev browser, the `apps/web` marketing site (its
  waitlist and contact forms and the page-visit beacon), and the `apps/admin`
  dashboard call the API cross-origin. In dev, `CORS_ALLOW_ALL_ORIGINS` defaults to on (via `DEBUG`);
  in production set it to `0` and list real origins in `CORS_ALLOWED_ORIGINS`
  (including the marketing site's and admin dashboard's domains). Native app
  builds don't need CORS.
