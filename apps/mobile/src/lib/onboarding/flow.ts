/**
 * The onboarding step order, resolved from the served config.
 *
 * Which steps appear and in what order is now data (see
 * `services/onboardingConfig`), but the *routes* stay a literal union: the app
 * builds with `typedRoutes`, so `router.push` only accepts a route the file tree
 * actually contains. Config therefore names steps, and this module is the one
 * place that maps a step key to its screen — it can never point at a route that
 * doesn't exist.
 *
 * `/onboarding` itself is a dispatcher (`app/onboarding/index.tsx`) that
 * forwards to the first active step, which is what lets *any* step — including
 * the name step that used to be hard-wired first — be reordered or skipped.
 */
export const ONBOARDING_STEP_KEYS = [
  'name',
  'instrument',
  'experience',
  'goal',
  'practice',
  'clarke',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/** Every step's screen. The keys mirror the backend's step catalog. */
export const STEP_ROUTES = {
  name: '/onboarding/name',
  instrument: '/onboarding/instrument',
  experience: '/onboarding/experience',
  goal: '/onboarding/goal',
  practice: '/onboarding/practice',
  clarke: '/onboarding/clarke',
} as const;

export type OnboardingRoute = (typeof STEP_ROUTES)[OnboardingStepKey];

/** The minimum a resolved step needs for ordering — config carries much more. */
interface StepLike {
  stepKey: OnboardingStepKey;
}

/** Only steps this build has a screen for, so unknown keys can never route. */
function known(steps: readonly StepLike[]): OnboardingStepKey[] {
  return steps.map((step) => step.stepKey).filter((key) => key in STEP_ROUTES);
}

/** The routes this flow walks, in order. */
export function activeRoutes(steps: readonly StepLike[]): OnboardingRoute[] {
  return known(steps).map((key) => STEP_ROUTES[key]);
}

/** How many steps the progress dots should show. */
export function stepTotal(steps: readonly StepLike[]): number {
  return known(steps).length;
}

/**
 * 1-based position of a step in this flow, for the progress dots.
 *
 * Falls back to 1 for a step the flow doesn't include — reachable from the
 * account screen's edit deep-links, where the dots are hidden anyway, but a
 * zero would be a silently wrong count if that ever changed.
 */
export function stepPosition(stepKey: OnboardingStepKey, steps: readonly StepLike[]): number {
  return Math.max(1, known(steps).indexOf(stepKey) + 1);
}

/** The route after this step, or null when it is the last one. */
export function nextStepRoute(
  stepKey: OnboardingStepKey,
  steps: readonly StepLike[],
): OnboardingRoute | null {
  const keys = known(steps);
  const next = keys[keys.indexOf(stepKey) + 1];
  return next ? STEP_ROUTES[next] : null;
}

/** Where `/onboarding` should send someone starting the flow. */
export function firstRoute(steps: readonly StepLike[]): OnboardingRoute {
  return activeRoutes(steps)[0] ?? STEP_ROUTES.name;
}
