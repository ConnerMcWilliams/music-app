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
| GET    | `/api/profile/`         | ✓    | Caller's streak/stats                          |

Throttles: `auth_login` 10/min, `auth_register` 5/min, `submissions` 20/min
per user (env-overridable, see `backend/.env.example`).

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

## API integration rules (mobile)

- **Base URL is defined in exactly one place**:
  `apps/mobile/src/services/api.ts` (`API_BASE_URL`). Never hard-code hosts or
  duplicate endpoint strings in screens. In dev the app logs
  `[api] base URL: …` at startup — check it first when requests fail.
- **Auth attachment lives in exactly one place**:
  `authClient.authedRequest(path, init, opts)`
  (`apps/mobile/src/services/auth/client.ts`). Every authenticated call goes
  through it; never read tokens in screens or attach headers by hand.
- **Every Django route ends with a trailing slash.** `POST /api/submissions`
  (no slash) does not redirect — it fails.
- **Multipart uploads:** never set `Content-Type` manually; fetch must add the
  boundary. On native, append the file as `{uri, name, type}`; on web, append
  the Blob. Never attach a timeout/`AbortSignal` to an upload — RN's Android
  networking fails multipart requests instantly when a signal is present
  (docs/troubleshooting.md).
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
