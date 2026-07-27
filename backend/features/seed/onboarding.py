"""
The onboarding flow as it shipped: the seed for the ``default`` variant.

Every string here is a verbatim transcription of what the six mobile screens
(`apps/mobile/src/app/onboarding/*.tsx`) and
`apps/mobile/src/data/onboardingChoices.ts` render today, so seeding a fresh
database reproduces the current flow exactly and the first dashboard edit starts
from what players actually see.

This is also the server's own fallback: ``GET /api/onboarding/config/`` serves
these steps when no variant has been seeded, so an empty database can never gate
a signup. The mobile app carries its own copy of the same flow for when the
request fails outright — two fallbacks, because onboarding is a hard gate and
neither side may assume the other is reachable.

Kept as a constants module beside the management command that loads it, in the
same shape as ``studies/seed/clarke.py``.
"""
from __future__ import annotations

from features import onboarding_catalog as catalog

DEFAULT_KEY = "default"
DEFAULT_NAME = "Default flow"
DEFAULT_NOTES = "The six-step flow the app shipped with. Duplicate this to build a test arm."


def _options(*values: object) -> list[dict]:
    """Filter-only options: the client supplies the labels."""
    return [{"value": value} for value in values]


DEFAULT_STEPS: list[dict] = [
    {
        "step_key": catalog.STEP_NAME,
        "enabled": True,
        "copy": {
            "title": "What should we call you?",
            "subtitle": "We'll use this to greet you when you sit down to practice.",
            "cta": "",
            "field_label": "Your name",
            "placeholder": "Herbert",
        },
        "options": {},
    },
    {
        "step_key": catalog.STEP_INSTRUMENT,
        "enabled": True,
        "copy": {
            "title": "What do you play?",
            "subtitle": "Clarke wrote these for cornet. We'll transpose them for your instrument.",
            "cta": "",
        },
        "options": {
            "instruments": _options(
                "trumpet",
                "cornet",
                "flugelhorn",
                "piccolo-trumpet",
                "french-horn",
                "mellophone",
                "alto-horn",
                "baritone-treble",
                "euphonium-treble",
                "trombone",
                "bass-trombone",
                "tuba",
            )
        },
    },
    {
        "step_key": catalog.STEP_EXPERIENCE,
        "enabled": True,
        "copy": {
            "title": "How long have you been playing?",
            "subtitle": "This shapes how we pitch feedback — not how strictly we grade.",
            "cta": "",
        },
        "options": {
            "levels": [
                {
                    "value": "under_1",
                    "label": "Less than a year",
                    "hint": "Still building the basics.",
                },
                {
                    "value": "y1_3",
                    "label": "1–3 years",
                    "hint": "Comfortable with the fundamentals.",
                },
                {
                    "value": "y3_7",
                    "label": "3–7 years",
                    "hint": "Playing regularly, working on refinement.",
                },
                {
                    "value": "over_7",
                    "label": "7+ years",
                    "hint": "Experienced — here for the discipline.",
                },
            ]
        },
    },
    {
        "step_key": catalog.STEP_GOAL,
        "enabled": True,
        "copy": {
            "title": "What are you working toward?",
            "subtitle": "Pick the one that matters most right now. You can change it later.",
            "cta": "",
        },
        "options": {
            "goals": [
                {
                    "value": "tone",
                    "label": "Better tone and control",
                    "hint": "Steady, even sound at every dynamic.",
                },
                {
                    "value": "range",
                    "label": "Extend my range",
                    "hint": "Reach higher without forcing.",
                },
                {
                    "value": "endurance",
                    "label": "Build endurance",
                    "hint": "Last a full rehearsal or set.",
                },
                {
                    "value": "technique",
                    "label": "Faster, cleaner technique",
                    "hint": "Fingers and tongue together.",
                },
                {
                    "value": "consistency",
                    "label": "Practice consistently",
                    "hint": "Show up every day and keep a streak.",
                },
                {
                    "value": "audition",
                    "label": "Prepare for an audition",
                    "hint": "Get sharp for a chair test or seat.",
                },
            ]
        },
    },
    {
        "step_key": catalog.STEP_PRACTICE,
        "enabled": True,
        "copy": {
            "title": "How often do you want to practice?",
            "subtitle": (
                "Your streak aims at this. Be honest rather than ambitious — "
                "it's easier to raise later."
            ),
            "cta": "",
            "days_label": "Days per week",
            "reminder_label": "Daily reminder",
            "no_reminder_label": "Not now",
            "footnote": (
                "We'll save your preference now — you'll be asked to allow "
                "notifications before any reminder is sent."
            ),
        },
        "options": {
            "days": _options(3, 4, 5, 6, 7),
            "times": [
                {"value": "07:00:00", "label": "7:00 am"},
                {"value": "08:00:00", "label": "8:00 am"},
                {"value": "12:00:00", "label": "Noon"},
                {"value": "16:00:00", "label": "4:00 pm"},
                {"value": "18:00:00", "label": "6:00 pm"},
                {"value": "20:00:00", "label": "8:00 pm"},
            ],
        },
    },
    {
        "step_key": catalog.STEP_CLARKE,
        "enabled": True,
        "copy": {
            "title": "Where are you with the Clarke studies?",
            "subtitle": "We'll start you here. Everything before it stays open in the Studies tab.",
            "cta": "",
            "new_to_clarke_label": "New to Clarke",
            "new_to_clarke_hint": "Start at the First Study.",
        },
        "options": {"sections": _options(*range(1, 11))},
    },
]
