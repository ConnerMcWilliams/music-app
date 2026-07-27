# API Reference & Integration Rules

Single source of truth for the mobile↔Django contract. Update this file
whenever an endpoint, payload, or permission changes.

## Endpoints

All under `/api/`. Auth = requires `Authorization: Bearer <access>` (JWT).

| Method | Path                    | Auth | Purpose                                        |
| ------ | ----------------------- | ---- | ---------------------------------------------- |
| POST   | `/api/auth/register/`   | ✗    | Create account → `{user, access, refresh}` 201 |
| POST   | `/api/auth/login/`      | ✗    | Email+password → `{user, access, refresh}` 200 |
| POST   | `/api/auth/google/`     | ✗    | Google `{id_token}` → `{user, access, refresh}` 200 |
| POST   | `/api/auth/refresh/`    | ✗    | `{refresh}` → rotated `{access, refresh}`      |
| POST   | `/api/auth/logout/`     | ✓    | Blacklist the supplied `{refresh}` → 205       |
| GET    | `/api/auth/me/`         | ✓    | Caller's safe profile                          |
| GET    | `/api/preferences/`     | ✓    | Caller's onboarding answers (row created on first read) |
| PATCH  | `/api/preferences/`     | ✓    | Save one onboarding answer (partial) → updated preferences |
| GET    | `/api/studies/`         | ✗    | Study catalog (paginated; `?section=` filter)  |
| GET    | `/api/studies/<slug>/`  | ✗    | One study incl. MusicXML content               |
| POST   | `/api/submissions/`     | ✓    | Upload a take → graded result 201              |
| GET    | `/api/submissions/`     | ✓    | Caller's own take history (paginated, newest first) |
| GET    | `/api/submissions/<id>/` | ✓   | One of the caller's takes, incl. per-note verdicts |
| GET    | `/api/profile/`         | ✓    | Caller's streak/stats + XP/level/coins         |
| GET    | `/api/profile/study-scores/` | ✓ | Caller's best analyzed score per study + passing bar |
| POST   | `/api/profile/streak-freeze/` | ✓ | Spend coins on one streak freeze → updated profile |

Throttles: `auth_login` 10/min, `auth_register` 5/min, `auth_google` 10/min,
`submissions` 20/min per user (env-overridable, see `backend/.env.example`). The `submissions`
throttle caps uploads only (`POST`); listing history (`GET`) is not throttled.

## Submission flow

1. User records (expo-audio) or picks a file (expo-document-picker) on the
   Record screen (`apps/mobile/src/app/record.tsx`) — or hands over the WAV that
   analytical mode captured on the Practice screen (`?takeUri=&takeDuration=`,
   which opens Record straight in review; see
   [`architecture.md`](architecture.md) → *Analytical mode*).
2. `submitTakeForGrading` (`apps/mobile/src/services/api.ts`) builds
   `multipart/form-data` and POSTs it through `authClient.authedRequest`
   (attaches the bearer token, refreshes once on 401, 60 s upload timeout).
3. Django validates (`grading/serializers.py`), stores the take under
   `MEDIA_ROOT/submissions/<uuid>/`, grades it synchronously
   (`grading/engine/`), records practice and rewards (streak, stats, XP/coins)
   on the submitter's profile, and returns the grade.
4. The app stores the result (`services/lastGradingResult.ts`) and navigates to
   the Results tab.

### Request — `POST /api/submissions/` (multipart/form-data)

| Field              | Type   | Required | Notes                                       |
| ------------------ | ------ | -------- | ------------------------------------------- |
| `audio`            | file   | yes      | ≤30 MB; extension allowlist (m4a, mp3, wav, mp4, aac, caf, 3gp, amr, ogg, opus, webm, flac) |
| `exercise_id`      | string | no       | Exercise-level study slug, e.g. `clarke-2-5` (≤64 ch). Send the specific exercise, not a section-level `clarke-2` — the grader can only align a take note-by-note when it knows which of a Study's ~30 exercises was played. The client resolves this via `toStudySlug` (`apps/mobile/src/data/index.ts`). |
| `exercise_title`   | string | no       | Display title (≤200 ch)                     |
| `duration_seconds` | float  | no       | Client-reported clip length                 |

Do **not** send a user id — the submitter is always taken from the token.

### Response (201)

```json
{
  "submission_id": "uuid",
  "exercise_id": "clarke-2-5",
  "exercise_title": "Clarke Study No. 2",
  "study_slug": "clarke-2-5",
  "total_score": 84,
  "grade_label": "B",
  "categories": [{ "label": "Pitch Accuracy", "score": 98 }],
  "feedback_author": "Prof. Halvorsen",
  "feedback_initials": "PH",
  "feedback_text": "...",
  "note_grading": true,
  "note_results": [{ "i": 0, "v": "correct", "t": -0.02, "c": 6.5, "m": 58 }],
  "note_summary": { "correct": 22, "wrong": 1, "missed": 1, "extra": 0, "gradeable": 24 },
  "xp_awarded": 420,
  "coins_awarded": 50,
  "level": 2,
  "rank_title": "Beginner",
  "leveled_up": true
}
```

### Note-level grading fields

`study_slug` is the catalog study the take was actually graded against, and is
what the Results overlay uses to pick notation — `exercise_id` is echoed back
verbatim and may be a legacy section-level id (`clarke-2`) that names a whole
Study rather than one exercise.

`note_grading` is true only when Pitch and Rhythm were scored from a note-by-note
match against the notation (see [`grading-rubric.md`](grading-rubric.md)). **The
app must render the notation overlay only when it is true** — otherwise the
verdicts are absent or untrustworthy, and colouring notes would contradict the
score. It is false for every grade stored before this feature existed.

`note_results` is one compact row per gradeable note, deliberately short-keyed
because a long study carries ~150 of them:

| Key | Meaning |
| --- | ------- |
| `i` | Expected-note index — the ordinal among *sounding* notes. **Not** the glyph position: the client's parser keeps rests and the grader does not, so map through `ExpectedNote.noteIndex` (`apps/mobile/src/lib/musicxml/timeline.ts`) before colouring. |
| `v` | `correct` · `wrong` · `missed` |
| `t` | Signed onset error in beats; positive is late. Absent when missed. |
| `c` | Signed cents from the expected pitch. Absent when missed. |
| `m` | MIDI actually heard, for "expected D, heard C♯". Absent when missed. |

`note_summary` tallies those plus `extra` (notes played that matched nothing
notated, which have no expected index and so cannot appear in `note_results`).

`note_grading` and `note_summary` ride on **every** grade payload — the POST
response, each history row, and the single-submission GET. `note_results` is
carried only by the POST response and by `GET /api/submissions/<id>/`: a history
page is 50 rows and a long study carries ~150 verdicts, so inlining them would
add a few hundred KB to every history load for the one take a player taps. The
Results screen fetches them for that take (see the detail endpoint below).

All of it is shaped by `backend/grading/wire.py`, so a tapped past take renders
exactly what the fresh grade did. Client mapping lives in one place:
`apps/mobile/src/services/noteResults.ts`.

`xp_awarded` pays only the improvement over the caller's prior best on this
study (0 when the take didn't beat it, the study is unknown, or the audio
couldn't be analyzed — see *Rewards* below); `coins_awarded` is what this take's
level-ups granted (coins drop only on level-up); `level`/`rank_title`/
`leveled_up` reflect the profile after the take, so the Results screen can show
a level-up without a second request.

Errors: 400 field errors (`{"audio": ["..."]}`), 401 missing/expired token,
429 throttled. The app surfaces the DRF `detail`/field message verbatim.

### History — `GET /api/submissions/`

Lists **only the caller's own** takes, newest first, using DRF's default
`PageNumberPagination` (`{count, next, previous, results}`). Each row carries
everything the Profile "Recent recordings" list renders plus what the Results
screen needs to replay the audio and show the stored grade, so a tapped row
renders straight away (the per-note verdicts are the one thing it leaves out —
see the detail endpoint below). The Profile "Score progress" chart also derives its
trend from these rows' scores and timestamps — no separate request. The mobile
app maps this via `apps/mobile/src/services/submissions.ts` (see
`hooks/useSubmissions.ts`: `useSubmissions` loads page 1 for the Profile
"Recent recordings" list; `useSubmissionsPage(page)` drives the "All recordings"
screen (`apps/mobile/src/app/recordings.tsx`) Previous/Next pager, reading
`next` to know when another page follows).

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "submission_id": "uuid",
      "exercise_id": "clarke-2-5",
      "exercise_title": "Clarke Study No. 2",
      "study_slug": "clarke-2-5",
      "created_at": "2026-07-07T18:03:00Z",
      "duration_seconds": 42.0,
      "audio_url": "http://host/media/submissions/<uuid>/take.m4a",
      "grade": {
        "total_score": 84,
        "grade_label": "B",
        "categories": [{ "label": "Pitch Accuracy", "score": 98 }],
        "feedback_author": "Prof. Halvorsen",
        "feedback_initials": "PH",
        "feedback_text": "...",
        "note_grading": true,
        "note_summary": {
          "correct": 22, "wrong": 1, "missed": 1, "extra": 0, "gradeable": 24
        },
        "xp_awarded": 420
      }
    }
  ]
}
```

`grade` is `null` while a submission has no stored `GradingResult`. `audio_url`
is an absolute URL (`request.build_absolute_uri`); note media is Django-served
only in `DEBUG` — production audio via object storage is future work. Errors:
401 missing/expired token.

### One take — `GET /api/submissions/<submission_id>/`

The same row shape as a history entry, with `grade.note_results` included. Only
the caller's own takes are visible; anyone else's id is a `404`.

The Results screen calls this when it is showing a take that came from history:
such a take arrives with `note_grading: true` and no verdicts, and this fills in
the overlay for that one take (`fetchSubmissionNoteResults` in
`apps/mobile/src/services/submissions.ts`). A freshly submitted take already has
its verdicts from the POST response and needs no call. Errors: 401
missing/expired token, 404 unknown or not the caller's.

## Profile & rewards

### `GET /api/profile/`

The caller's streak, aggregate stats, and reward economy — what the Today and
Profile screens (including the Level card) render, except the Today card's
study itself (see *study-scores* below). `level`/`rank_title` are
derived server-side from lifetime `xp`; `freeze_cost`/`max_freezes` are echoed
so the client never hardcodes prices. Mapped in
`apps/mobile/src/services/profile.ts`.

```json
{
  "day_streak": 7,
  "personal_best": 12,
  "studies_done": 4,
  "avg_score": 83,
  "xp": 800,
  "level": 3,
  "rank_title": "Beginner",
  "xp_into_level": 200,
  "xp_for_next_level": 600,
  "coins": 100,
  "streak_freezes": 0,
  "freeze_cost": 200,
  "max_freezes": 3
}
```

### `GET /api/profile/study-scores/`

The caller's best **analyzed** score per catalog study, plus whether it clears
the passing bar — the input to the Today card's progression (the first study the
user hasn't passed, in catalog order from the caller's `clarke_start_section` —
see *Onboarding & preferences* below). One row per study with at least one
analyzed grade, keyed by the resolved `Submission.study` slug (so legacy
section-level ids like `clarke-2` count toward the study they resolved to);
takes that resolved to no study and length-only grades (`analyzed=False`) are
excluded — the same rules as the XP prior-best. `passing_score`
(`PASSING_SCORE` in `backend/grading/models.py`, currently 70) is echoed so the
client never hardcodes the threshold. Not paginated — rows are bounded by the
190-study catalog.

```json
{
  "passing_score": 70,
  "studies": [
    { "slug": "clarke-1-1", "best_score": 84, "passed": true },
    { "slug": "clarke-1-2", "best_score": 61, "passed": false }
  ]
}
```

Rows are ordered by slug. Errors: 401 missing/expired token. The mobile app
maps this via `apps/mobile/src/services/studyScores.ts`; `lib/todayStudy.ts`
walks the client catalog order (`STUDY_SECTIONS`) for the first unpassed slug,
and `hooks/useTodayStudy.ts` serves it to the Today card and the Practice tab's
no-param open (refetched on tab focus so the card advances after a passing
take; signed out / offline it falls back to the first catalog study).

### `POST /api/profile/streak-freeze/` (no body)

Spends `freeze_cost` coins on one streak freeze; each freeze bridges one missed
practice day so the streak survives (consumed automatically when the next take
is recorded). 200 → the updated profile (same shape as above, so the client can
refresh coins/freezes in one round-trip); 400 with a `detail` message when the
caller already holds `max_freezes` or can't afford it; 401 missing/expired
token.

### Rewards

A graded take earns XP only for beating the caller's prior best score on that
study, paying the improvement: `(new_best% − old_best%) / 100 × study value`.
A study's value is `difficulty × 100` (both exposed as `difficulty` and
`xp_value` on the study endpoints), so its lifetime yield is capped at
`best% × value` — replaying can't farm XP. Length-only grades (audio the server
couldn't decode) earn no XP and don't set a best. Coins are granted only on
level-up. The tuning constants (level curve, rank titles, coin amounts) live in
`backend/progress/rewards.py`.

## Onboarding & preferences

### `GET`/`PATCH /api/preferences/`

The caller's onboarding answers. `GET` creates the row on first access (lazy
`get_or_create`, same as `/api/profile/`), so a brand-new or pre-existing
account always reads a full object rather than a 404.

```json
{
  "display_name": "Marcus Bell",
  "instrument": "flugelhorn",
  "experience_level": "y3_7",
  "primary_goal": "tone",
  "practice_days_goal": 5,
  "reminder_time": "08:00:00",
  "reminder_enabled": true,
  "clarke_start_section": 3,
  "onboarding_completed": true
}
```

- `display_name` is **proxied to `User.display_name`** — the account owns it, so
  the name step writes through this one endpoint like every other step. Signup
  no longer asks for a name.
- `instrument` is a slug from `backend/users/instruments.py` (see
  [`product.md`](product.md) for the twelve). Anything else is rejected.
- `experience_level` ∈ `under_1` · `y1_3` · `y3_7` · `over_7`;
  `primary_goal` ∈ `tone` · `range` · `endurance` · `technique` · `consistency` ·
  `audition`. Blank `""` means unanswered.
- `practice_days_goal` must be 1–7; `clarke_start_section` must be 1–10, or
  `null` for "new to Clarke". **`null` is an answer, not an omission** — the
  client sends the key explicitly.
- `reminder_time` is a naive local wall-clock `HH:MM:SS`; the device would
  schedule the notification, so no timezone is stored. Nothing schedules it yet.
- `onboarding_completed` is read-only.

**`PATCH` is partial and sent once per step**, so abandoning the flow keeps the
answers already given and the user resumes where they stopped. The final step
adds a write-only `complete: true`, which stamps `onboarding_completed_at`
**once** — re-sending it (e.g. editing an answer later) never moves the original
timestamp. That first stamp is also what sends the account's welcome email (see
[`authentication.md`](authentication.md#permissions--security)): the name is
collected here, so this is the first point at which it can greet the player by
name.

Errors: 400 with DRF field errors (`{"instrument": ["..."]}`) on an invalid
value; 401 missing/expired token. A caller only ever reads or writes their own
row — the user comes from the access token, never from the request body.

### `onboarding_completed` on the auth payload

Every auth response that carries a `user` object — `register`, `login`,
`google`, and `me` — includes a read-only `onboarding_completed` boolean. It is
`true` only when a preferences row exists **and** carries a completion stamp, so
**an account with no row reads `false`** — which is what routes accounts created
before onboarding existed through the flow exactly once. The mobile route guard
reads it off the session (see
[`authentication.md`](authentication.md#route-guard)); shipping it on the
existing payload means the client needs no extra request to know where to send
the user.

## API integration rules (mobile)

- **Base URL is defined in exactly one place**:
  `apps/mobile/src/services/api.ts` (`API_BASE_URL`). Never hard-code hosts or
  duplicate endpoint strings in screens. In dev the app logs
  `[api] base URL: …` at startup — check it first when requests fail.
- **Auth attachment lives in one place**: JSON calls go through
  `authClient.authedRequest(path, init)` (bearer + refresh-retry on 401); the
  native file upload can't use `fetch`, so it pulls a token from
  `authClient.getAccessToken({ forceRefresh })` and refreshes-and-retries once
  itself. Never read tokens in screens or attach headers by hand.
- **Every Django route ends with a trailing slash.** `POST /api/submissions`
  (no slash) does not redirect — it fails.
- **File uploads do NOT use `fetch` + `FormData` on native.** Expo's `fetch`
  polyfill rejects React Native's `{uri,name,type}` file part (`Unsupported
  FormDataPart implementation`). Native uploads go through expo-file-system's
  `new File(uri).upload(url, { uploadType: MULTIPART, fieldName, parameters,
  headers })`; web uses `fetch`+`FormData`+`Blob`. See docs/troubleshooting.md
  and don't collapse the native path back onto `fetch`.
- **For the web `fetch` path**, never set `Content-Type` manually (the boundary
  must be auto-added) and never attach a timeout/`AbortSignal` to an upload.
- **Errors:** non-2xx → throw `ApiError` (server's own message + status);
  transport failure → `NetworkError`; unrecoverable session → `AuthError`.
  Screens branch on these types — never swallow errors into one generic string.
- Wire format is snake_case; app types are camelCase. Map at the service layer.

## What must not change without tests

Auth flows (`users/`), submission permissions/validation (`grading/`),
the reward economy (`progress/rewards.py` tuning, XP-on-improvement rules,
streak-freeze purchase), the study-scores aggregation (caller-only,
analyzed-only, the `PASSING_SCORE` boundary), the onboarding gate
(`onboarding_completed` defaulting to false, one-shot `complete`, partial PATCH
preserving unsent answers) and the twelve instrument slugs with their sounding
offsets, `authClient` token handling, and `submitTakeForGrading`'s request shape
are all pinned by tests (`backend/*/tests.py`,
`apps/mobile/tests/api.submit.test.ts`, `auth.client.test.ts`,
`record.flow.test.tsx`, `useTodayStudy.test.tsx`, `onboarding.flow.test.tsx`,
`auth.routeGuard.test.ts`). Change behavior → change tests in the same PR.
