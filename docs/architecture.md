# Architecture

## Chosen Stack

This project will be a monorepo with:
 - 'apps\mobile': Expo + react native mobile app
 - 'apps\web': Next.js public marketing / waitlist website (static; waitlist and contact forms post to the backend)
 - 'apps\admin': Next.js owner-only internal dashboard (signup analytics, newsletter, updates publishing, onboarding config + A/B)
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
  itself deploys on a managed host (Railway/Render/Fly): it carries a Railway
  deploy config (`backend/railway.json`) and builds from `backend/Dockerfile`, and
  is served by gunicorn with WhiteNoise for static assets — see the backend
  README's *Deployment* section.
- **Configuration:** the app reads a single `DATABASE_URL` connection string
  (parsed with `dj-database-url`). The same code path points at local Docker in
  dev and at Neon/Railway in production — only the env var changes. See
  `backend/.env.example`.

Managed Postgres was chosen over Supabase to keep authentication, file storage,
and data access owned by Django (as described in *Current System Boundaries*)
rather than split across a separate backend-as-a-service. Supabase remains a
viable later option if managing auth/storage in Django becomes a burden.

## Authentication

Accounts and sessions are owned by the Django backend (no third-party auth
platform holds the session). The `users` app defines a custom email-login user
model (UUID pk) and a JWT API (`djangorestframework-simplejwt`) with short-lived
access tokens and rotating refresh tokens. Both email/password and Google
sign-in are supported: Google is an *identity provider* only — the app runs the
native Google flow, sends the resulting ID token to `/api/auth/google/`, and the
backend verifies it and mints the same JWT session as an email login. The mobile
app keeps auth state in a single provider, stores tokens in Expo SecureStore
(never AsyncStorage), and gates protected routes so session restoration never
flashes protected content. Full details — endpoints, the Google flow and Cloud
Console setup, token lifecycle, the account model, secure storage, and env vars
— live in [`authentication.md`](authentication.md).

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

Study progression also lives in `progress`: `GET /api/profile/study-scores/`
(authenticated) aggregates the caller's best *analyzed* grade per resolved
study and marks each against the passing bar (`grading.models.PASSING_SCORE`).
The mobile app walks its catalog order against these rows to surface the first
unpassed study on the Today card (and the Practice tab's no-param open),
refetching on focus so the card advances right after a passing take. Where that
walk *starts* is the player's choice, from onboarding (below): a stored Clarke
start section moves the starting point only — earlier studies are never marked
passed and stay open in the Studies tab.

The same graded take also drives a **reward economy** (pure tuning functions in
`backend/progress/rewards.py`; `Profile` stores `xp_total`, `coins`,
`streak_freezes`). Each study has an XP value from its `difficulty` (the Clarke
section, I–X → 1–10; capstone études far higher), and a take earns XP only for
*beating the caller's prior best* on that study — it pays the improvement, so a
study's lifetime yield is capped at `best% × value` and replaying can't farm
XP. Lifetime XP derives the account level and rank title; coins are granted
only on level-up and are spent on streak freezes
(`POST /api/profile/streak-freeze/`), each of which bridges one missed day so
the streak survives. The grading view locks the profile row and reads the prior
best inside one transaction, so concurrent uploads can't double-pay the same
improvement.

The full endpoint table, submission payload contract, and mobile integration
rules live in [`api.md`](api.md); the security posture in
[`security.md`](security.md); dev-networking failures in
[`troubleshooting.md`](troubleshooting.md).

## Onboarding & preferences

A third companion model, `users.UserPreferences`, holds what the player *chose*
rather than what they earned: instrument, experience, primary goal, practice
cadence and reminder time, and where they already are in the Clarke studies. It
sits in `users` rather than `progress` precisely because `Profile` owns
practice-accrued state; standing choices belong next to identity, and this is
where later account settings go too. Like `Profile`, the row is created lazily
on first access.

A six-step flow (`apps/mobile/src/app/onboarding/`) collects the answers and
**blocks the tabs until it is finished**, for accounts created before it existed
as well as new ones — the gate is a nullable `onboarding_completed_at` stamp,
surfaced as `onboarding_completed` on every auth payload, so *no row* reads as
*not onboarded*. Each step PATCHes `/api/preferences/` on its own, so an
abandoned run resumes where it stopped, and every answer is editable afterwards
from the account screen, which deep-links back into the same step screens rather
than duplicating the forms. Because the name is asked here, signup itself
collects only email and password.

**The flow itself is data, not code.** Which steps appear, in what order, with
what copy and which answers offered comes from `GET /api/onboarding/config/`
(`backend/features/`), edited from the admin dashboard's Config tab, so a
question can be reworded, reordered or dropped without an app release — and two
versions can run head to head as an A/B experiment. The *answers* stay code:
every value must still satisfy the `UserPreferences` columns, and
`features/onboarding_catalog.py` is the code-owned schema every saved variant is
validated against, so no dashboard edit can produce a flow the app can't render.

Three properties hold that together. `/onboarding` is a **dispatcher** that
forwards to the first active step, which is what lets *any* step be skipped —
when the name step was the entry route it was the one step that couldn't be. The
config is fetched **once per run**, at the onboarding layout, so an edit landing
mid-flow can't reorder the steps under someone. And because onboarding is a hard
gate, **both sides carry the shipped flow as a fallback** — the server when
nothing is seeded, the app (`src/data/onboardingConfig.ts`) whenever the request
fails. The app's copy is a fallback rather than a mirror: the server wins
whenever reachable, so drift is self-correcting.

Experiments assign on the first config read rather than at registration, so
"started" means "opened onboarding"; bucketing is a hash of `(experiment, user)`
and the assignment row pins it, so editing a weight never re-buckets anyone
mid-flight. The funnel is per-step view beacons plus the completion stamp, and
the metric that decides an experiment is *activation* — whether the player then
recorded a gradable take — not completion rate. See
[`admin.md`](admin.md#onboarding-config--ab).

The instrument list — twelve brass instruments in four written-key/clef classes
— is a pure constants module (`backend/users/instruments.py`) mirrored in TS for
the picker, not a database table: the set is fixed, the metadata is musical
fact, and each entry already carries the clef and sounding offset that
per-instrument transposition of the Clarke corpus will need. That transposition
is separate, later work; today every study is engraved in the original B♭
treble. See [`product.md`](product.md) for the list,
[`api.md`](api.md#onboarding--preferences) for the endpoint, and
[`authentication.md`](authentication.md#route-guard) for the route guard.

## Current System Boundaries

The mobile app is responsible for:

- Authentication UI
- Exercise selection
- Recording
- Uploading
- Displaying feedback
- Displaying streaks, rewards (XP/level/coins/freezes), and practice history

The Django backend is responsible for:

- Users and profiles
- Exercises
- Submissions
- Grading results
- Streak calculation
- Reward economy (XP, levels, coins, streak freezes)
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
`Submission`/`GradingResult` models and the `/api/submissions/` endpoints (POST
grades a take; GET lists the caller's own history, and `GET <id>/` returns one
take with its per-note verdicts), plus a Django-free, NumPy-only engine in
`backend/grading/engine/` (decode →
analyse → score). It scores the rubric in [`grading-rubric.md`](grading-rubric.md)
and returns the grade the mobile Results screen renders. When a take resolves to
exactly one transcribed exercise, Pitch and Rhythm are scored **note-by-note**
against the study's notation (`engine/{timeline,segment,align}.py`), which is
what drives the Results screen's green/red overlay; otherwise those two fall
back to reference-free heuristics. Tempo and Tone are always reference-free, and
the study's MusicXML sets the Completion target. Compressed device recordings
(m4a) decode via PyAV (a default dependency whose wheel bundles FFmpeg), so no
system install is needed. See the backend README's *Grading* section for setup,
and [`grading-rubric.md`](grading-rubric.md) for when note-level grading is
deliberately skipped.

## Analytical mode (live feedback)

The Practice screen can judge playing **as it happens**: notes on the rendered
notation turn green when the player lands them and red when they don't. This is
the only part of the app that analyses audio on-device — everything that affects
a *score* is still graded server-side.

- `apps/mobile/src/lib/analysis/` holds the engine, mirroring the structure of
  `src/lib/metronome/`: pure `types.ts` (thresholds + contracts), `playhead.ts`
  (which note the beat clock is inside), `matcher.ts` (frames → verdicts),
  `micBackend.ts` (`MicBackend` + `AudioApiMicBackend` + `SilentMicBackend`),
  and `liveAnalysis.ts` (the controller). `useLiveAnalysis` binds it to React
  with the same lifetime rules as `useMetronome` — prepared on mount, disposed
  on unmount, stopped on blur, so the microphone never outlives the screen.
- **It is tempo-locked to the metronome**, which is why enabling it starts the
  click with a count-in. The metronome supplies the timebase; without it there
  is no way to know which note the player should be on.
- Pitch detection is `src/lib/pitch/` — a hand-rolled radix-2 FFT and
  autocorrelation tracker that is a **deliberate port of**
  `backend/grading/engine/analysis.py`, down to the frame geometry (46 ms window,
  10 ms hop) and the search constants. The two must stay in step: if they drift,
  a take reads green live and red in its results. `MATCH_SEMITONES` and the
  no-octave-tolerance rule are likewise shared with `engine/align.py`.
- Capture is `react-native-audio-api`'s `AudioRecorder`, the same package the
  metronome already uses. It streams PCM through `onAudioReady` **and** writes a
  WAV via `enableFileOutput`, so one session yields both the live overlay and a
  submittable take. Web has no recorder, so `createMicBackend()` returns the
  silent backend — CI builds the web bundle, so that branch is load-bearing.
- The take is handed to the Record screen (`router.push('/record', {takeUri,
  takeDuration})`), which opens straight in review. That is why a player can
  grade the run they just played instead of playing it again.

**Known limitation — analytical mode expects headphones.** The microphone hears
the metronome: the click sits inside the detector's range and the accent folds
onto a subharmonic, so a click can read as a confident pitch. On a device
speaker that costs the player two things, and the card on the Practice screen
says so:

- **spurious verdicts**, most visibly on rests and in quiet passages, where no
  real note is sounding to outweigh the click;
- **no automatic correction for input latency.** The frame offset is the fixed
  `DEFAULT_LATENCY_SECONDS`, so a device whose real round-trip latency is far
  from it reads consistently late. An earlier build re-anchored the timeline
  from the first sound heard, but on speakers that first sound is a click, so it
  anchored on the click rather than on the player and corrected nothing. It was
  removed rather than left in place looking like protection that wasn't there;
  `LiveSessionSummary.medianTimingErrorSeconds` is how the constant gets tuned
  from real devices instead.

Nothing here blocks a session on speakers — it just reads worse. See the module
headers in `micBackend.ts` and `liveAnalysis.ts`.

## Notation rendering (MusicXML)

Studies carry canonical, machine-readable notation in the backend as
`StudyContent.musicxml` (see `backend/studies/models.py`), served on the study
detail endpoint. The mobile app renders that MusicXML on the Practice, Results,
and Record screens.

**Use the existing component — do not write a new renderer.**

- `apps/mobile/src/components/practice/MusicXmlView.tsx` is the notation surface,
  used on Practice, Results, and Record. It paints precomputed layout with
  `react-native-svg` (no WebView, no native module, works on web too), with
  page-flip controls for longer studies. Tapping the card opens it fullscreen
  (`expandable={false}` opts out).
- `apps/mobile/src/components/practice/ScoreSheet.tsx` holds the pieces both the
  card and the fullscreen view draw with — `SystemStaff` (one system, one SVG),
  `PageControls`, and `NOTE_STATE_COLORS`. There is one painter, not two.
- `apps/mobile/src/components/practice/ExpandedScoreModal.tsx` is the fullscreen
  view. It is a React Native `Modal`, deliberately not an expo-router route:
  Practice's live-analysis state (`noteStates`, `activeNoteIndex`) is screen-local,
  and a modal renders in the same React tree, so a take stays live while expanded
  without lifting any of it into a store. The three call sites pass nothing extra.
  It measures its own stage and repacks the study with `paginateToHeight` (below),
  so a page holds as much music as the screen actually shows. It dismisses three
  ways — the close button, a tap anywhere outside the cream sheet, and Android
  back — and the sheet claims the touch responder so the notation and the pager
  never dismiss it by accident.
- `apps/mobile/src/lib/musicxml/layout.ts` is the pure engraving layout
  (`layoutScore`: pages → systems of placed glyphs). Notes get duration-based
  widths (plus accidental/dot clearance, and a tuplet's ratio narrows its slot);
  measures pack one or two per staff line by width *and* by whether the justified
  slot spacing still clears `MIN_SLOT_SPACING`, so dense bars stay readable.
  Level-1 `<beam>` runs render as straight beams (secondary 16th beams derive
  from note type), and tuplet groups get a bracket + numeral placed on the side
  away from the stems. Every system carries its own vertical bounds, and the
  component sets the SVG `viewBox`/`aspectRatio` from them — ledger-line notes
  (the catalog spans E3–G6) are never clipped and notation scales uniformly with
  screen width.
  Passages wider than a line wrap to more systems and pages; there is no
  horizontal scrolling, and there is no vertical scrolling either — everything
  pages. Systems chunk into pages two ways: `layoutScore` uses the fixed
  `SYSTEMS_PER_PAGE` (the embedded card has no height to speak of), while
  `paginateToHeight(systems, availableHeight, renderWidth)` packs greedily
  against a measured box for the fullscreen view. The second is possible because
  a system's drawn height is exactly `renderWidth * height / LINE_WIDTH` — the
  aspect ratio the painter locks — so measuring the container is enough to know
  what fits. Layout math is unit-tested directly, including a sweep over the
  entire bundled catalog (`tests/musicxml.layout*.test.ts`).
- `apps/mobile/src/hooks/useScorePaging.ts` is the page cursor both views use:
  rewind on a new study, clamp after a repagination, and follow the playhead
  across page breaks. The follow tracks the page it resolved, not just the note,
  so a repagination that moves the same note elsewhere re-flips rather than
  stranding the cursor. Each view keeps its own cursor, which is the point — they
  paginate differently, so their page *numbers* mean different things. It adjusts
  state during render rather than in an effect, so a flip lands in the same commit
  as the content that caused it; an effect would paint a stale page first.
- `apps/mobile/src/lib/musicxml/parseMusicXML.ts` is the dependency-free MusicXML
  reader (`ParsedScore`/`ParsedNote`). It is a deliberate subset — the module
  header lists the exact elements it reads — so extend it there rather than
  adding an XML-parser dependency, which the Expo dependency graph does not
  tolerate well.

**Screen orientation is portrait everywhere except the fullscreen score.**
Landscape roughly doubles note size, which is the main reason to expand at all,
so the rule is enforced at runtime rather than declared: `app.json` sets
`orientation: "default"` (iOS will not rotate to an orientation the binary never
declared, whatever the runtime asks for) plus `ios.requireFullScreen` and the
`expo-screen-orientation` plugin's `initialOrientation: "PORTRAIT_UP"`, and
`src/app/_layout.tsx` locks portrait on mount. `ExpandedScoreModal` lifts that
lock while it is open and restores it on close *and* on unmount, so an unmount
mid-rotation cannot strand the rest of the app sideways. All of this goes
through `src/lib/orientation.ts`, which `require`s `expo-screen-orientation`
lazily inside each call's `try`/`catch` (the same shape as
`services/auth/google.ts`): the package resolves its native module at *module*
scope and throws there, so a top-level import would take the root layout down
with it on a dev build made before the module was added, whatever the call sites
catch. Loaded under the catch, it degrades to "stays portrait" instead. Use
`OrientationLock.DEFAULT`, not `ALL`: `ALL` is invalid on devices that don't
support upside-down portrait, which is most iPhones.

Data flow: the study's MusicXML comes from `@/data` via
`getMusicXmlForExercise(id)`, which looks it up in `MUSICXML_BY_ID` (bundled from
`backend/studies/seed/musicxml/` by `apps/mobile/scripts/gen-musicxml.mjs`). Both
`src/app/(tabs)/practice.tsx`, the Results tab, and the Record screen render
`<MusicXmlView exercise={…} musicXml={…} />`; a study without notation falls back
to the card's "notation unavailable" state. When the app moves to a live API,
swap the lookup for the study-detail fetch (`content.musicxml`) — the component
props stay the same.

If a renderer needs capabilities beyond the current subset (multiple voices,
dynamics, articulations, etc.), grow `parseMusicXML` + `MusicXmlView`. Introduce a
WebView-based engine (e.g. OpenSheetMusicDisplay) only if SVG rendering proves
insufficient, and record that decision here first.

## Marketing website (`apps/web`)

The public marketing / waitlist site is a static Next.js (App Router) app,
implemented from the Claude Design landing page, plus standalone `/privacy`,
`/contact`, and `/updates` routes. It is self-contained (own lockfile, `web:*`
root scripts, `web-ci.yml`) and its backend coupling is four public
touchpoints: the waitlist form (`POST /api/waitlist/`, backend `waitlist` app,
which welcomes new signups by email), the contact form (`POST /api/contact/`,
backend `contact` app, which also emails the site owner), the client-side
updates feed (`GET /api/updates/`, backend
`updates` app), and a fire-and-forget page-visit beacon (`POST /api/site/visit/`,
backend `analytics` app) that feeds the admin conversion rate. The site also
carries first-party SEO (per-page canonicals, a code-generated Open Graph image,
robots/sitemap, and JSON-LD structured data). Details, placeholders, and the
integration/deployment notes live in [`web.md`](web.md).

## Admin dashboard (`apps/admin`)

The owner-only internal dashboard is a static Next.js (App Router) app in the
same style as `apps/web`, run locally on port 3100 and not linked from any
public surface. It signs in with the existing JWT endpoints and calls a new set
of **staff-gated** backend endpoints (DRF `IsAdminUser`, i.e. `User.is_staff` —
the codebase's first staff-only surface): signup analytics and waitlist browsing
(`dashboard` app, now including a conversion rate over first-party page-visit
counts from the `analytics` app), plain-text newsletter sending to subscribed
waitlist signups
(with signed one-click unsubscribe links from the `waitlist` app), update
posts published to the site's `/updates` page (`updates` app), and the **Config**
tab (`features` app) — editing the mobile onboarding flow and A/B testing two
versions of it without an app release. It is self-contained (own lockfile,
`admin:*` root scripts, `admin-ci.yml`). Full details — pages, the admin↔Django
endpoint contract, newsletter mechanics, and how to read an onboarding
experiment — live in [`admin.md`](admin.md).

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
