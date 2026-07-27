/**
 * The current user's onboarding answers: instrument, experience, goal, practice
 * cadence, and where they are in the Clarke studies.
 *
 * Backed by `GET`/`PATCH /api/preferences/`. PATCH is partial, so the onboarding
 * flow saves one step at a time and an abandoned run resumes where it stopped.
 * The same endpoint backs the "Practice preferences" rows on the account screen.
 *
 * `displayName` is proxied here from the account so the first onboarding step
 * writes through this one endpoint like every other step.
 */
import { authClient } from '@/services/auth';

export type ExperienceLevel = 'under_1' | 'y1_3' | 'y3_7' | 'over_7';
export type PrimaryGoal =
  | 'tone'
  | 'range'
  | 'endurance'
  | 'technique'
  | 'consistency'
  | 'audition';

/** App-facing preferences (camelCase). Empty strings mean "not answered yet". */
export interface Preferences {
  displayName: string;
  instrument: string;
  experienceLevel: ExperienceLevel | '';
  primaryGoal: PrimaryGoal | '';
  practiceDaysGoal: number;
  /** `HH:MM:SS` local wall-clock, or null when never set. */
  reminderTime: string | null;
  reminderEnabled: boolean;
  /** Clarke study 1–10 to start from; null means "new to Clarke". */
  clarkeStartSection: number | null;
  onboardingCompleted: boolean;
}

/** Backend `/api/preferences/` response (snake_case wire format). */
interface PreferencesWire {
  display_name: string;
  instrument: string;
  experience_level: ExperienceLevel | '';
  primary_goal: PrimaryGoal | '';
  practice_days_goal: number;
  reminder_time: string | null;
  reminder_enabled: boolean;
  clarke_start_section: number | null;
  onboarding_completed: boolean;
}

/** What a single onboarding step (or one account-screen edit) can change. */
export type PreferencesPatch = Partial<Omit<Preferences, 'onboardingCompleted'>> & {
  /** Sent by the final step to stamp completion. Write-only; never echoed back. */
  complete?: boolean;
};

/** Nothing answered yet — rendered until the fetch resolves. */
export const EMPTY_PREFERENCES: Preferences = {
  displayName: '',
  instrument: '',
  experienceLevel: '',
  primaryGoal: '',
  practiceDaysGoal: 5,
  reminderTime: null,
  reminderEnabled: false,
  clarkeStartSection: null,
  onboardingCompleted: false,
};

function mapPreferences(body: PreferencesWire): Preferences {
  return {
    displayName: body.display_name ?? '',
    instrument: body.instrument ?? '',
    experienceLevel: body.experience_level ?? '',
    primaryGoal: body.primary_goal ?? '',
    practiceDaysGoal: body.practice_days_goal,
    reminderTime: body.reminder_time,
    reminderEnabled: body.reminder_enabled,
    clarkeStartSection: body.clarke_start_section,
    onboardingCompleted: body.onboarding_completed,
  };
}

/** camelCase patch → the snake_case body, omitting keys the caller left out. */
function mapPatch(patch: PreferencesPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.displayName !== undefined) body.display_name = patch.displayName;
  if (patch.instrument !== undefined) body.instrument = patch.instrument;
  if (patch.experienceLevel !== undefined) body.experience_level = patch.experienceLevel;
  if (patch.primaryGoal !== undefined) body.primary_goal = patch.primaryGoal;
  if (patch.practiceDaysGoal !== undefined) body.practice_days_goal = patch.practiceDaysGoal;
  if (patch.reminderTime !== undefined) body.reminder_time = patch.reminderTime;
  if (patch.reminderEnabled !== undefined) body.reminder_enabled = patch.reminderEnabled;
  if (patch.clarkeStartSection !== undefined) {
    // null is meaningful: it is the "new to Clarke" answer.
    body.clarke_start_section = patch.clarkeStartSection;
  }
  if (patch.complete !== undefined) body.complete = patch.complete;
  return body;
}

/** GET `/api/preferences/` — the caller's answers, creating the row on first access. */
export async function fetchPreferences(): Promise<Preferences> {
  const resp = await authClient.authedRequest('/api/preferences/', { method: 'GET' });
  if (!resp.ok) {
    throw new Error(`Preferences request failed (HTTP ${resp.status}).`);
  }
  return mapPreferences(await resp.json());
}

/**
 * PATCH `/api/preferences/` — save one step's answer.
 *
 * Returns the full updated preferences. Throws with the backend's field message
 * on a validation rejection so the step can surface it inline.
 */
export async function savePreferences(patch: PreferencesPatch): Promise<Preferences> {
  const resp = await authClient.authedRequest('/api/preferences/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapPatch(patch)),
  });
  if (!resp.ok) {
    const message = await resp
      .json()
      .then((body) => {
        const record = body as Record<string, unknown>;
        if (typeof record.detail === 'string') return record.detail;
        // DRF field errors: {"instrument": ["..."]} — surface the first verbatim.
        const first = Object.values(record)[0];
        return Array.isArray(first) && typeof first[0] === 'string' ? first[0] : undefined;
      })
      .catch(() => undefined);
    throw new Error(message ?? `Saving preferences failed (HTTP ${resp.status}).`);
  }
  return mapPreferences(await resp.json());
}
