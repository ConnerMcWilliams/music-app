# Git Workflow

This project uses a trunk-based Git workflow.

The goal is to keep `main` stable, avoid long-lived branches, and make every change small enough to review safely.

## Branches

### `main`

`main` is the trunk branch.

It should always be in a working, production-ready state.

Rules for `main`:

* Do not commit directly to `main`.
* All changes must go through a pull request.
* CI must pass before merging.
* Prefer squash merges to keep history clean.
* `main` should be deployable at any time.

### Short-lived work branches

All work should happen in short-lived branches created from `main`.

Branch naming:

```txt
feature/<issue-number>-short-description
fix/<issue-number>-short-description
chore/<issue-number>-short-description
docs/<issue-number>-short-description
spike/<issue-number>-short-description
```

Examples:

```txt
feature/12-recording-screen
feature/18-submission-upload-api
fix/23-audio-permission-error
chore/31-add-backend-ci
docs/40-update-grading-rubric
spike/45-expo-recording-test
```

Branches should be deleted after they are merged.

## Pull Requests

Every meaningful change should use a pull request.

A pull request should:

* Reference a GitHub issue.
* Be focused on one task.
* Include a short summary.
* Include testing notes.
* Keep the diff small.
* Avoid unrelated cleanup.
* Pass CI before merge.

A normal PR should usually touch fewer than 10 files.

Large PRs are allowed only when the PR description explains why the change could not be split.

## Commit Style

Use simple conventional commits.

Examples:

```txt
feat: add recording screen
feat: add submission upload endpoint
fix: handle denied microphone permissions
chore: add backend CI
docs: document grading workflow
test: add submission model tests
```

Recommended commit types:

```txt
feat
fix
docs
test
chore
refactor
spike
```

## Merge Strategy

Use squash merge for feature branches.

The squash commit message should summarize the final change, not every small intermediate commit.

Example:

```txt
feat: add submission upload flow
```

## Issue-Based Development

Every code change should begin with an issue.

Issues should describe:

* Goal
* Scope
* Non-goals
* Files or areas likely affected
* Acceptance criteria
* Testing requirements

Do not start broad issues like:

```txt
Build the app
Add grading
Make the frontend
```

Prefer small issues like:

```txt
Add Django submissions app
Add submission upload model
Add Expo recording permission screen
Add basic grading result model
```

## CI Requirements

Before merging, CI should run the relevant checks.

Backend checks may include:

```txt
python -m pip install --upgrade pip
pip install -e ".[dev]"
python manage.py test
```

Mobile checks may include:

```txt
npm install
npm run lint
npm run typecheck
npm test
```

The exact commands should match the current project setup.

## Trunk-Based Rules

Because this project uses trunk-based development:

* Keep branches short-lived.
* Merge frequently.
* Avoid long-running feature branches.
* Avoid a permanent `develop` branch.
* Hide unfinished features behind simple flags or leave them unlinked from the UI.
* Keep `main` working at all times.

## Release Strategy

Early in development, releases can happen directly from `main`.

Later, the project may add tags:

```txt
v0.1.0
v0.2.0
v1.0.0
```

Use tags when a version is meaningful enough to preserve.

## Protected Branch Settings

On GitHub, protect `main`.

Recommended settings:

* Require pull request before merging.
* Require status checks to pass.
* Require branches to be up to date before merging.
* Require conversation resolution before merging.
* Block force pushes.
* Block deletion of `main`.

## Definition of Done

A feature is done when:

* The code is implemented.
* The behavior is tested.
* CI passes.
* The PR description explains what changed.
* Relevant docs are updated.
* Known risks are documented.
* The branch is squash-merged into `main`.
