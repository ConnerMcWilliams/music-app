# Product Details

## Background
I just graduated trumpet after a successful trumpet career after being ranked number one in my state at CMEA for trumpet. I have had an incredible trumpet teacher who focused a lot on the fundamentals. This enabled me to be disciplined and learn quick and efficiently with good habits. One of the main studies he would focus on was the Clarke studies. I decided to make online trumpet teacher / habit building app using what I learned.

## What is the app?
The app consists of three main features:
 - The ability to read, upload, and analyze recordings and studies.
 - The social aspect. There will be sharing, but I have not decided the best way to go about it.
 - The habit building. Classic daily streaks and hooks.

The core system of the app is:
The app presents them with a variety of studies to choose from. After the user picks one, they have the opportunity to either study it using a technique / program that the app provides, or record and upload a video of them playing it. The app then takes this recording and analyzes the recording and gives a grade.

## Who is this app for?
This app is for brass players. It will start with just classical studies but jazz will be added in the future.

Onboarding asks every player which instrument they play, from twelve brass
instruments grouped by family:

| Family | Instruments |
|--------|-------------|
| Trumpet | Trumpet, Cornet, Flugelhorn, Piccolo Trumpet |
| Horn | French Horn, Mellophone, Alto / Tenor Horn |
| Low brass | Baritone Horn (treble clef), Euphonium (treble clef), Trombone, Bass Trombone, Tuba |

The onboarding flow's wording, step order, and which steps appear are edited
from the admin dashboard's Config tab and served to the app at runtime (see
[`admin.md`](admin.md#onboarding-config--ab)) — a question can be reworded or
dropped without an app release, and two versions can be A/B tested. The
instrument *list* is not part of that: it is defined once in
`backend/users/instruments.py` and mirrored for the picker in
`apps/mobile/src/data/instruments.ts`. The set is fixed and the metadata is
musical fact, so a variant may hide instruments but never rename them. Each entry carries the clef the
player reads and its sounding offset in semitones (`sounding = written + offset`,
the same convention as `StudyContent.transposition_semitones`), which collapses
the twelve down to four written-key/clef classes: B♭ treble, F treble, E♭ treble,
and C bass. Transposing the Clarke studies into those four is separate, later
work — today every study is engraved in the original B♭ treble.

## Marketing / waitlist website
Before public launch, the product's front door is the marketing site in
`apps/web`: it pitches the app (daily Clarke Studies, automated feedback,
streaks), tells the founder story, and collects waitlist signups for the
private beta. The signup form posts to the backend waitlist endpoint — see
[`web.md`](web.md) for what's real, what's stubbed, and the launch plan.