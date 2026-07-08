# API Reference & Integration Rules

Single source of truth for the mobile↔Django contract. Update this file
whenever an endpoint, payload, or permission changes.

## Endpoints

All under `/api/`. Auth = requires `Authorization: Bearer <access>` (JWT).

| Method | Path                    | Auth | Purpose                                        |
| ------ | ----------------------- | ---- | ---------------------------------------------- |
| POST   | `/api/auth/register/`   | ✗    | Create account → `{user, access, refresh}` 201 |
| POST   | `/api/auth/login/`      | ✗    | Email+password → `{user, access, refresh}` 200 |
| POST   | `/api/auth/refresh/`    | ✗    | `{refresh}` → rotated `{access, refresh}`      |
| POST   | `/api/auth/logout/`     | ✓    | Blacklist the supplied `{refresh}` → 205       |
| GET    | `/api/auth/me/`         | ✓    | Caller's safe profile                          |
| GET    | `/api/studies/`         | ✗    | Study catalog (paginated; `?section=` filter)  |
| GET    | `/api/studies/<slug>/`  | ✗    | One study incl. MusicXML content               |
| POST   | `/api/submissions/`     | ✓    | Upload a take → graded result 201              |
| GET    | `/api/submissions/`     | ✓    | Caller's own take history (paginated, newest first) |
| GET    | `/api/profile/`         | ✓    | Caller's streak/stats                          |

Throttles: `auth_login` 10/min, `auth_register` 5/min, `submissions` 20/min
per user (env-overridable, see `backend/.env.example`). The `submissions`
throttle caps uploads only (`POST`); listing history (`GET`) is not throttled.

## Submission flow

1. User records (expo-audio) or picks a file (expo-document-picker) on the
   Record screen (`apps/mobile/src/app/record.tsx`).
2. `submitTakeForGrading` (`apps/mobile/src/services/api.ts`) builds
   `multipart/form-data` and POSTs it through `authClient.authedRequest`
   (attaches the bearer token, refreshes once on 401, 60 s upload timeout).
3. Django validates (`grading/serializers.py`), stores the take under
   `MEDIA_ROOT/submissions/<uuid>/`, grades it synchronously
   (`grading/engine/`), records practice on the submitter's profile, and
   returns the grade.
4. The app stores the result (`services/lastGradingResult.ts`) and navigates to
   the Results tab.

### Request — `POST /api/submissions/` (multipart/form-data)

| Field              | Type   | Required | Notes                                       |
| ------------------ | ------ | -------- | ------------------------------------------- |
| `audio`            | file   | yes      | ≤30 MB; extension allowlist (m4a, mp3, wav, mp4, aac, caf, 3gp, amr, ogg, opus, webm, flac) |
| `exercise_id`      | string | no       | App exercise id, e.g. `clarke-2` (≤64 ch)   |
| `exercise_title`   | string | no       | Display title (≤200 ch)                     |
| `duration_seconds` | float  | no       | Client-reported clip length                 |

Do **not** send a user id — the submitter is always taken from the token.

### Response (201)

```json
{
  "submission_id": "uuid",
  "exercise_id": "clarke-2",
  "exercise_title": "Clarke Study No. 2",
  "total_score": 84,
  "grade_label": "B",
  "categories": [{ "label": "Pitch Accuracy", "score": 98 }],
  "feedback_author": "Prof. Halvorsen",
  "feedback_initials": "PH",
  "feedback_text": "..."
}
```

Errors: 400 field errors (`{"audio": ["..."]}`), 401 missing/expired token,
429 throttled. The app surfaces the DRF `detail`/field message verbatim.

### History — `GET /api/submissions/`

Lists **only the caller's own** takes, newest first, using DRF's default
`PageNumberPagination` (`{count, next, previous, results}`). Each row carries
everything the Profile "Recent recordings" list renders plus what the Results
screen needs to replay the audio and show the stored grade, so a tapped row
needs no second request. The Profile "Score progress" chart also derives its
trend from these rows' scores and timestamps — no separate request. The mobile
app maps this via `apps/mobile/src/services/submissions.ts` (see
`hooks/useSubmissions.ts`).

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "submission_id": "uuid",
      "exercise_id": "clarke-2",
      "exercise_title": "Clarke Study No. 2",
      "created_at": "2026-07-07T18:03:00Z",
      "duration_seconds": 42.0,
      "audio_url": "http://host/media/submissions/<uuid>/take.m4a",
      "grade": {
        "total_score": 84,
        "grade_label": "B",
        "categories": [{ "label": "Pitch Accuracy", "score": 98 }],
        "feedback_author": "Prof. Halvorsen",
        "feedback_initials": "PH",
        "feedback_text": "..."
      }
    }
  ]
}
```

`grade` is `null` while a submission has no stored `GradingResult`. `audio_url`
is an absolute URL (`request.build_absolute_uri`); note media is Django-served
only in `DEBUG` — production audio via object storage is future work. Errors:
401 missing/expired token.

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
`authClient` token handling, and `submitTakeForGrading`'s request shape are all
pinned by tests (`backend/*/tests.py`, `apps/mobile/tests/api.submit.test.ts`,
`auth.client.test.ts`, `record.flow.test.tsx`). Change behavior → change tests
in the same PR.
