# AI Workflow

This document defines how AI coding assistants should work in this repository.

The goal is to use AI for speed without letting the codebase become disorganized, inconsistent, or hard to maintain.

## Project Context

This is a music practice app focused on Clarke Studies.

The first version should support this core flow:

1. User signs up or logs in.
2. User chooses a Clarke Study exercise.
3. User records or uploads a video/audio submission.
4. Django stores the submission.
5. Python grading code analyzes the recording.
6. User sees feedback and a score.

Do not prioritize leaderboards, contests, social feeds, or Strava-style sharing until the core recording and grading loop works.

## Required Reading Before Coding

Before making code changes, the AI assistant must read the relevant project docs.

At minimum:

```txt
README.md
AGENTS.md
docs/product.md
docs/architecture.md
docs/git-workflow.md
docs/grading-rubric.md
docs/recording-spike.md
```

When backend work is involved, also inspect:

```txt
backend/
backend/apps/
backend/config/
```

When mobile work is involved, also inspect:

```txt
apps/mobile/
apps/mobile/app/
apps/mobile/services/
apps/mobile/lib/
```

## Before Coding

Before writing code, the AI assistant should:

1. Summarize the relevant existing architecture.
2. Identify the files likely to change.
3. Explain the implementation plan.
4. Identify risks or unclear requirements.
5. Avoid coding until the task scope is clear.

If explicitly told to implement immediately, the AI may proceed, but it should still keep the change small and scoped.

## During Coding

The AI assistant must:

* Keep diffs small.
* Follow existing project structure.
* Prefer existing patterns over inventing new ones.
* Avoid unrelated refactors.
* Avoid adding dependencies unless justified.
* Add or update tests for meaningful behavior.
* Update docs when architecture or workflows change.
* Keep mobile UI logic in `apps/mobile`.
* Keep backend product logic in `backend/apps`.
* Keep grading logic in `backend/apps/grading/services`.
* Keep upload/submission logic in `backend/apps/submissions`.

## Dependency Rules

Do not add a new dependency unless the PR explains:

* What problem it solves.
* Why the standard library or existing dependency is not enough.
* Whether it affects mobile, backend, or both.
* Any security, performance, or maintenance risks.

For Python grading libraries, prefer adding dependencies deliberately and documenting why they are needed.

For Expo/mobile dependencies, be extra careful because native recording behavior can vary by device.

## Sensitive Areas

The AI assistant must be especially careful when editing:

```txt
backend/config/settings/
backend/apps/users/
backend/apps/submissions/
backend/apps/grading/
backend/apps/streaks/
apps/mobile/lib/recording.ts
apps/mobile/lib/upload.ts
apps/mobile/services/api.ts
.env.example
.github/workflows/
```

Changes to authentication, permissions, uploads, environment variables, database models, or grading logic should include tests or a clear explanation if tests are not yet possible.

## Testing Expectations

For backend changes, add or update Django tests when possible.

Examples:

```txt
backend/apps/submissions/tests/
backend/apps/grading/tests/
backend/apps/exercises/tests/
```

For mobile changes, add tests when the project has a mobile testing setup.

If tests cannot be added yet, the PR must include manual testing steps.

## AI Output After Coding

After making changes, the AI assistant should report:

```txt
Summary
Files changed
Tests added or updated
Commands run
Known risks
Suggested next issue
```

Example:

```txt
Summary:
Added the initial Submission model and admin registration.

Files changed:
- backend/apps/submissions/models.py
- backend/apps/submissions/admin.py
- backend/apps/submissions/tests/test_models.py

Tests:
- Added model test for default submission status.

Commands run:
- python manage.py test backend.apps.submissions

Known risks:
- File storage is still local only.
- Upload size limits are not configured yet.

Suggested next issue:
- Add authenticated submission upload endpoint.
```

## Prompting Pattern

Use this pattern for AI coding tasks:

```txt
Read the relevant docs first.
Work only on Issue <number>.
Do not make unrelated changes.
Before coding, summarize your plan.
After coding, list files changed, tests run, and known risks.
```

Good prompt example:

```txt
Work on Issue 12: Add the initial submissions app.

Scope:
- Add Submission model.
- Include user, exercise, uploaded file, status, created_at, updated_at.
- Add basic admin registration.
- Add model tests.
- Do not add grading logic yet.
- Do not add mobile upload UI yet.
```

Bad prompt example:

```txt
Build the upload and grading system.
```

## Vertical Slice Priority

The first major milestone is the smallest useful product loop:

```txt
Record/upload -> store submission -> grade recording -> show feedback
```

Build in this order:

1. Project scaffold.
2. Frontend
3. Exercises model.
4. Submissions model.
5. Local upload endpoint.
6. Expo recording spike.
7. Mobile upload flow.
8. Basic grading service.
9. Grading result display.
10. Streak tracking.

Do not build social features, contests, rankings, or advanced recommendation systems until this loop works reliably.

## Documentation Rules

Update documentation when:

* The architecture changes.
* A new app/module is introduced.
* The grading rubric changes.
* Recording assumptions change.
* CI commands change.
* Environment variables change.
* The Git or AI workflow changes.

Docs should be short, accurate, and practical.

## Non-Goals for AI

The AI assistant should not:

* Rewrite the entire app without approval.
* Add a new framework without approval.
* Add social features before the core practice loop.
* Add leaderboards before grading is reliable.
* Add cloud storage before local upload flow works, unless explicitly requested.
* Invent environment variables without updating `.env.example`.
* Store secrets in code.
* Commit directly to `main`.
