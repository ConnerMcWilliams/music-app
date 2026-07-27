"""
The editable surface of the onboarding flow, declared in code.

The database stores the *words*; this module owns the *schema*. It lists the six
steps the mobile app can render, the copy slots each one exposes, and the legal
option values behind each question. Everything an admin saves is validated
against it (``features.serializers``), so no dashboard edit can produce a config
the app cannot render.

Two deliberate limits:

* **Answer values are never editable.** They are the same slugs and enums the
  ``users.UserPreferences`` columns are constrained to, so a variant can hide or
  reorder an option but can never invent one the model would reject.
* **Instrument and Clarke labels are not editable either.** Instrument labels
  live in ``users.instruments`` and are pinned to the client by
  ``InstrumentCatalogTests.test_typescript_mirror_matches_this_module``; Clarke
  section labels come from the seeded study catalog. A variant filters and
  orders those lists, and the client supplies the names.

Adding a copy slot here is all it takes for the dashboard editor to grow a field
for it — the editor renders itself from ``GET /api/features/onboarding/catalog/``.
"""
from __future__ import annotations

from dataclasses import dataclass

from users import instruments
from users.models import UserPreferences

# Step keys. These are the contract with the mobile app, which maps each to one
# of its six expo-router screens; renaming one is a breaking client change.
STEP_NAME = "name"
STEP_INSTRUMENT = "instrument"
STEP_EXPERIENCE = "experience"
STEP_GOAL = "goal"
STEP_PRACTICE = "practice"
STEP_CLARKE = "clarke"

# ``clarke_start_section`` accepts 1–10 (``UserPreferencesSerializer``); "new to
# Clarke" is the null answer and is a copy slot below, not an option.
CLARKE_SECTIONS: tuple[int, ...] = tuple(range(1, 11))

# ``practice_days_goal`` accepts 1–7 (``UserPreferencesSerializer``).
PRACTICE_DAYS: tuple[int, ...] = tuple(range(1, 8))

# Every half hour of the day, as the naive local ``HH:MM:SS`` wall-clock
# ``reminder_time`` stores. A closed set keeps validation total while still
# letting a variant offer whatever times it likes; the label is the admin's.
REMINDER_TIMES: tuple[str, ...] = tuple(
    f"{hour:02d}:{minute:02d}:00" for hour in range(24) for minute in (0, 30)
)


@dataclass(frozen=True)
class CopySlot:
    """One editable string on a step."""

    key: str
    # Shown above the input in the dashboard editor.
    label: str
    max_length: int
    multiline: bool = False
    # Optional slots may be saved blank, which means "use the app's own default"
    # — that is how the CTA keeps saying Continue/Save unless overridden.
    required: bool = True


@dataclass(frozen=True)
class OptionGroup:
    """One list of answers on a step, and what a variant may change about it."""

    key: str
    label: str
    # Legal values in canonical order. A variant may drop and reorder these; it
    # can never introduce one, because the model column would reject the answer.
    values: tuple[object, ...]
    # Which per-option strings the admin may write. Empty means filter-only:
    # the client supplies the labels (instruments, Clarke sections).
    editable: tuple[str, ...] = ()


@dataclass(frozen=True)
class StepSpec:
    """One onboarding step: its identity, its copy, and its questions."""

    key: str
    # The mobile route, carried for documentation and for the dashboard's links.
    route: str
    # Human name for the dashboard's step card.
    name: str
    copy_slots: tuple[CopySlot, ...]
    option_groups: tuple[OptionGroup, ...] = ()


# Copy slots every step has. ``cta`` is optional: blank leaves the app's own
# Continue/Save wording in place.
_TITLE = CopySlot("title", "Title", max_length=120)
_SUBTITLE = CopySlot("subtitle", "Subtitle", max_length=240, multiline=True)
_CTA = CopySlot("cta", "Button label", max_length=40, required=False)


STEPS: tuple[StepSpec, ...] = (
    StepSpec(
        key=STEP_NAME,
        route="/onboarding",
        name="Name",
        copy_slots=(
            _TITLE,
            _SUBTITLE,
            _CTA,
            CopySlot("field_label", "Field label", max_length=60),
            CopySlot("placeholder", "Field placeholder", max_length=60),
        ),
    ),
    StepSpec(
        key=STEP_INSTRUMENT,
        route="/onboarding/instrument",
        name="Instrument",
        copy_slots=(_TITLE, _SUBTITLE, _CTA),
        option_groups=(
            OptionGroup(
                key="instruments",
                label="Instruments offered",
                values=tuple(i.slug for i in instruments.INSTRUMENTS),
            ),
        ),
    ),
    StepSpec(
        key=STEP_EXPERIENCE,
        route="/onboarding/experience",
        name="Experience",
        copy_slots=(_TITLE, _SUBTITLE, _CTA),
        option_groups=(
            OptionGroup(
                key="levels",
                label="Experience levels",
                values=tuple(UserPreferences.ExperienceLevel.values),
                editable=("label", "hint"),
            ),
        ),
    ),
    StepSpec(
        key=STEP_GOAL,
        route="/onboarding/goal",
        name="Goal",
        copy_slots=(_TITLE, _SUBTITLE, _CTA),
        option_groups=(
            OptionGroup(
                key="goals",
                label="Goals",
                values=tuple(UserPreferences.PrimaryGoal.values),
                editable=("label", "hint"),
            ),
        ),
    ),
    StepSpec(
        key=STEP_PRACTICE,
        route="/onboarding/practice",
        name="Practice cadence",
        copy_slots=(
            _TITLE,
            _SUBTITLE,
            _CTA,
            CopySlot("days_label", "Days group heading", max_length=60),
            CopySlot("reminder_label", "Reminder group heading", max_length=60),
            CopySlot("no_reminder_label", '"No reminder" chip', max_length=40),
            CopySlot("footnote", "Footnote", max_length=240, multiline=True),
        ),
        option_groups=(
            OptionGroup(key="days", label="Days per week offered", values=PRACTICE_DAYS),
            OptionGroup(
                key="times",
                label="Reminder times offered",
                values=REMINDER_TIMES,
                editable=("label",),
            ),
        ),
    ),
    StepSpec(
        key=STEP_CLARKE,
        route="/onboarding/clarke",
        name="Clarke start",
        copy_slots=(
            _TITLE,
            _SUBTITLE,
            _CTA,
            CopySlot("new_to_clarke_label", '"New to Clarke" label', max_length=60),
            CopySlot("new_to_clarke_hint", '"New to Clarke" hint', max_length=120),
        ),
        option_groups=(
            OptionGroup(key="sections", label="Studies offered", values=CLARKE_SECTIONS),
        ),
    ),
)

STEP_KEYS: tuple[str, ...] = tuple(spec.key for spec in STEPS)

_BY_KEY: dict[str, StepSpec] = {spec.key: spec for spec in STEPS}


def get_step(key: object) -> StepSpec | None:
    """The spec for this step key, or ``None`` if it isn't one we render."""
    return _BY_KEY.get(key) if isinstance(key, str) else None


def prune_step(step: dict) -> dict:
    """Drop anything in a stored step the catalog no longer recognises.

    Variants are data and this module is code, so a document saved when an
    option was legal outlives the release that removed it. Filtering on read as
    well as on write means a stale row degrades to a shorter list rather than
    offering an answer the preferences API would now reject.
    """
    spec = get_step(step.get("step_key"))
    if spec is None:
        return step

    options = step.get("options") or {}
    pruned: dict[str, list] = {}
    for group in spec.option_groups:
        legal = list(group.values)
        rows = options.get(group.key)
        if not isinstance(rows, list):
            rows = [{"value": value} for value in legal]
        kept = [
            row for row in rows if isinstance(row, dict) and row.get("value") in legal
        ]
        # Never hand the app an empty question; fall back to the full catalog.
        pruned[group.key] = kept or [{"value": value} for value in legal]

    return {
        "step_key": spec.key,
        "enabled": step.get("enabled", True),
        "copy": {
            slot.key: (step.get("copy") or {}).get(slot.key, "") for slot in spec.copy_slots
        },
        "options": pruned,
    }


def as_schema() -> list[dict]:
    """The catalog as JSON, for the dashboard editor to render itself from."""
    return [
        {
            "step_key": spec.key,
            "route": spec.route,
            "name": spec.name,
            "copy_slots": [
                {
                    "key": slot.key,
                    "label": slot.label,
                    "max_length": slot.max_length,
                    "multiline": slot.multiline,
                    "required": slot.required,
                }
                for slot in spec.copy_slots
            ],
            "option_groups": [
                {
                    "key": group.key,
                    "label": group.label,
                    "values": list(group.values),
                    "editable": list(group.editable),
                }
                for group in spec.option_groups
            ],
        }
        for spec in STEPS
    ]
