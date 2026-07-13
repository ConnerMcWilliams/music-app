"""
The reward economy for the practice loop: study XP values, the XP→level curve,
rank titles, and the coin / streak-freeze constants.

Everything here is **pure** (no DB access) so the tuning numbers live in one
place and are trivially unit-testable. ``progress.models.Profile.record_practice``
and the grading view are the only callers that turn these into persisted state.

The mechanic (see the plan): a take earns XP only when it beats the player's
previous best on that study, and it pays the *improvement*::

    XP = (new_best% - old_best%) / 100 * study_value

So the lifetime XP a study can ever yield is capped at ``best% * study_value`` —
a perfect take fully "mines" it, and replaying can never farm XP. Coins are not
earned per take: they drop only on level-up, and are spent on streak freezes.
"""
from __future__ import annotations

from dataclasses import dataclass

# --- Study value ---------------------------------------------------------
# A study is worth ``difficulty`` × this. Difficulty tracks the Clarke section
# (I–X → 1–10, capstone études a little more), so harder studies pay more and
# steer players toward new material rather than grinding the easy ones.
XP_PER_DIFFICULTY = 100


def study_xp_value(study) -> int:
    """Max XP a study can ever yield (its value at a 100% take). 0 when unknown."""
    if study is None:
        return 0
    return study.difficulty * XP_PER_DIFFICULTY


def xp_delta(new_pct: int, prev_best_pct: int, study_value: int) -> int:
    """XP for a take: pays only the improvement over the prior best, else 0."""
    gain = max(0, new_pct - prev_best_pct)
    return round(gain / 100.0 * study_value)


# --- Levels --------------------------------------------------------------
# Cumulative XP required to *reach* a level (level 1 = 0 XP). Quadratic, so each
# level costs a bit more than the last: L2=500, L3=1500, L4=3000, L5=5000…
_LEVEL_COEFF = 250


def total_xp_for_level(level: int) -> int:
    """Cumulative XP needed to reach ``level`` (level 1 starts at 0)."""
    if level <= 1:
        return 0
    return _LEVEL_COEFF * level * (level - 1)


@dataclass(frozen=True)
class LevelProgress:
    level: int
    xp_into_level: int      # XP earned past the current level's threshold
    xp_for_next_level: int  # XP span from this level to the next


def level_for_xp(xp: int) -> LevelProgress:
    """Resolve total lifetime XP into a level and progress toward the next."""
    xp = max(0, xp)
    level = 1
    while total_xp_for_level(level + 1) <= xp:
        level += 1
    base = total_xp_for_level(level)
    nxt = total_xp_for_level(level + 1)
    return LevelProgress(
        level=level,
        xp_into_level=xp - base,
        xp_for_next_level=nxt - base,
    )


# --- Rank titles ---------------------------------------------------------
# Ordered ``(min_level, title)`` bands; the highest band whose threshold the
# level meets wins.
RANK_TITLES: list[tuple[int, str]] = [
    (1, "Beginner"),
    (5, "Student"),
    (10, "Cornetist"),
    (20, "Soloist"),
    (35, "Virtuoso"),
]


def rank_title(level: int) -> str:
    title = RANK_TITLES[0][1]
    for min_level, name in RANK_TITLES:
        if level >= min_level:
            title = name
        else:
            break
    return title


# --- Coins & streak freezes ---------------------------------------------
COINS_PER_LEVEL = 50   # coins granted per level gained (the only source of coins)
FREEZE_COST = 200      # coins to buy one streak freeze
MAX_FREEZES = 3        # most freezes a player can hold at once
