/**
 * The onboarding flow the server wants this account to see.
 *
 * Backed by `GET /api/onboarding/config/`, which returns which of the six steps
 * to show, in what order, with what copy and which answers offered — and, when
 * an A/B experiment is running, records which arm this account was placed in.
 *
 * Onboarding is a hard gate: an account that cannot finish it cannot use the
 * app. So every failure here is swallowed and the caller falls back to
 * `DEFAULT_ONBOARDING_CONFIG` (see `hooks/useOnboardingConfig`). The server has
 * its own copy of the same default for the same reason — neither side may
 * assume the other is reachable.
 */
import type { OnboardingStepKey } from '@/lib/onboarding/flow';
import { authClient } from '@/services/auth';

/** One selectable answer. `label`/`hint` are absent where the client owns them. */
export interface ConfiguredOption {
  value: string | number;
  label?: string;
  hint?: string;
}

/** One step of the flow, as configured. */
export interface ConfiguredStep {
  stepKey: OnboardingStepKey;
  /** Editable strings, keyed by the slot names in the backend's catalog. */
  copy: Record<string, string>;
  /** Answer lists, keyed by option-group name (`levels`, `days`, `times`, …). */
  options: Record<string, ConfiguredOption[]>;
}

export interface OnboardingConfig {
  variantKey: string;
  /** Null when no experiment is running — the caller is on the default flow. */
  experimentKey: string | null;
  armKey: string | null;
  /** Enabled steps only, already in the order the flow should walk them. */
  steps: ConfiguredStep[];
}

interface ConfigWire {
  variant_key: string;
  variant_name: string;
  experiment_key: string | null;
  arm_key: string | null;
  steps: {
    step_key: string;
    copy: Record<string, string>;
    options: Record<string, ConfiguredOption[]>;
  }[];
}

function mapConfig(body: ConfigWire): OnboardingConfig {
  return {
    variantKey: body.variant_key ?? '',
    experimentKey: body.experiment_key ?? null,
    armKey: body.arm_key ?? null,
    steps: (body.steps ?? []).map((step) => ({
      stepKey: step.step_key as OnboardingStepKey,
      copy: step.copy ?? {},
      options: step.options ?? {},
    })),
  };
}

/** GET `/api/onboarding/config/` — the flow to render for the current account. */
export async function fetchOnboardingConfig(): Promise<OnboardingConfig> {
  const resp = await authClient.authedRequest('/api/onboarding/config/', { method: 'GET' });
  if (!resp.ok) {
    throw new Error(`Onboarding config request failed (HTTP ${resp.status}).`);
  }
  return mapConfig(await resp.json());
}

/**
 * POST `/api/onboarding/views/` — note that a step was shown.
 *
 * The funnel beacon behind the dashboard's drop-off table. Deliberately returns
 * void and never throws: a step must not fail because analytics did. The server
 * de-duplicates, so a retry or a re-mount costs nothing.
 */
export async function recordStepView(stepKey: OnboardingStepKey): Promise<void> {
  try {
    await authClient.authedRequest('/api/onboarding/views/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_key: stepKey }),
    });
  } catch {
    // Intentionally silent — see above.
  }
}
