/**
 * The fixed answer sets for the experience and goal onboarding steps.
 *
 * Mirrors the backend's `UserPreferences.ExperienceLevel` / `PrimaryGoal`
 * `TextChoices` — change both together. Held here rather than inline in the step
 * screens because the account screen renders the same labels for the stored
 * answer; one list means a copy edit can't leave the picker and the account row
 * disagreeing. Same pattern as `instruments.ts` and its `instrumentLabel()`.
 */
import type { ExperienceLevel, PrimaryGoal } from '@/services/preferences';

/** One selectable answer: the stored value plus how the picker presents it. */
export interface Choice<Value extends string> {
  value: Value;
  label: string;
  hint: string;
}

export const EXPERIENCE_LEVELS: Choice<ExperienceLevel>[] = [
  { value: 'under_1', label: 'Less than a year', hint: 'Still building the basics.' },
  { value: 'y1_3', label: '1–3 years', hint: 'Comfortable with the fundamentals.' },
  { value: 'y3_7', label: '3–7 years', hint: 'Playing regularly, working on refinement.' },
  { value: 'over_7', label: '7+ years', hint: 'Experienced — here for the discipline.' },
];

export const PRIMARY_GOALS: Choice<PrimaryGoal>[] = [
  { value: 'tone', label: 'Better tone and control', hint: 'Steady, even sound at every dynamic.' },
  { value: 'range', label: 'Extend my range', hint: 'Reach higher without forcing.' },
  { value: 'endurance', label: 'Build endurance', hint: 'Last a full rehearsal or set.' },
  { value: 'technique', label: 'Faster, cleaner technique', hint: 'Fingers and tongue together.' },
  { value: 'consistency', label: 'Practice consistently', hint: 'Show up every day and keep a streak.' },
  { value: 'audition', label: 'Prepare for an audition', hint: 'Get sharp for a chair test or seat.' },
];

/** Display label for a stored value, falling back to an em dash when unanswered. */
function labelFor(choices: Choice<string>[], value: string | null | undefined): string {
  return choices.find((choice) => choice.value === value)?.label ?? '—';
}

export function experienceLabel(value: string | null | undefined): string {
  return labelFor(EXPERIENCE_LEVELS, value);
}

export function goalLabel(value: string | null | undefined): string {
  return labelFor(PRIMARY_GOALS, value);
}
