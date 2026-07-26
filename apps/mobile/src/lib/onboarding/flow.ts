/**
 * The onboarding step order, in one place.
 *
 * Screens read their position and their neighbours from here rather than
 * hard-coding routes, so inserting or reordering a question is a single edit.
 * `ONBOARDING_STEPS` in `components/onboarding/OnboardingStep` is the count these
 * routes produce — the test asserts they agree.
 */
export const ONBOARDING_ROUTES = [
  '/onboarding',
  '/onboarding/instrument',
  '/onboarding/experience',
  '/onboarding/goal',
  '/onboarding/practice',
  '/onboarding/clarke',
] as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];

/** 1-based position of a route in the flow, for the progress dots. */
export function stepNumber(route: OnboardingRoute): number {
  return ONBOARDING_ROUTES.indexOf(route) + 1;
}

/** The route after this one, or null when this is the last step. */
export function nextRoute(route: OnboardingRoute): OnboardingRoute | null {
  return ONBOARDING_ROUTES[ONBOARDING_ROUTES.indexOf(route) + 1] ?? null;
}
