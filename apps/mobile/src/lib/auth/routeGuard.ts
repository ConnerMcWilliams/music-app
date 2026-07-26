/**
 * Pure route-protection decision, factored out of the root layout so it can be
 * unit-tested without a navigator.
 *
 * Given font-load state, the resolved auth status, whether onboarding is still
 * owed, and which group the current route is in, it returns:
 *  - `redirectTo` — the route to `replace` to, or null if the current group is
 *    already correct;
 *  - `splashVisible` — whether the native splash must stay up. It stays up while
 *    fonts/session are unresolved OR a redirect is pending, so protected content
 *    is never shown to a logged-out user, login is never shown to a logged-in
 *    one, and the tabs never flash before the onboarding redirect lands.
 *
 * Three states, in priority order: signed out → the auth flow; signed in but not
 * onboarded → the onboarding flow (from anywhere, including the auth group a
 * fresh signup is still sitting in); signed in and onboarded → the tabs.
 *
 * Note the asymmetry: a user who owes onboarding is pulled *into* the flow from
 * anywhere, but a user who has finished it is not pushed *out* of it. That is
 * deliberate — the account screen deep-links back into these same screens to
 * change one answer, and the guard cannot see the `?edit=1` that marks those
 * visits as legitimate. The final step navigates to the tabs itself once it has
 * saved and refreshed the session.
 */
export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export interface GuardInput {
  fontsLoaded: boolean;
  status: AuthStatus;
  inAuthGroup: boolean;
  /** True when the signed-in user has not finished onboarding. */
  needsOnboarding: boolean;
  inOnboardingGroup: boolean;
}

export interface GuardDecision {
  redirectTo: '/welcome' | '/onboarding' | '/' | null;
  splashVisible: boolean;
}

export function resolveNavigation({
  fontsLoaded,
  status,
  inAuthGroup,
  needsOnboarding,
  inOnboardingGroup,
}: GuardInput): GuardDecision {
  const sessionResolved = status !== 'initializing';

  let redirectTo: GuardDecision['redirectTo'] = null;
  if (sessionResolved) {
    if (status === 'unauthenticated' && !inAuthGroup) {
      redirectTo = '/welcome';
    } else if (status === 'authenticated' && needsOnboarding && !inOnboardingGroup) {
      redirectTo = '/onboarding';
    } else if (status === 'authenticated' && !needsOnboarding && inAuthGroup) {
      redirectTo = '/';
    }
  }

  const splashVisible = !fontsLoaded || !sessionResolved || redirectTo !== null;
  return { redirectTo, splashVisible };
}
