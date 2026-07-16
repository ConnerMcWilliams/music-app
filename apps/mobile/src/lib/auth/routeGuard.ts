/**
 * Pure route-protection decision, factored out of the root layout so it can be
 * unit-tested without a navigator.
 *
 * Given font-load state, the resolved auth status, and whether the current
 * route is in the `(auth)` group, it returns:
 *  - `redirectTo` — the route to `replace` to, or null if the current group is
 *    already correct;
 *  - `splashVisible` — whether the native splash must stay up. It stays up while
 *    fonts/session are unresolved OR a redirect is pending, so protected content
 *    is never shown to a logged-out user and login is never shown to a logged-in
 *    one (no content flashing).
 */
export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export interface GuardInput {
  fontsLoaded: boolean;
  status: AuthStatus;
  inAuthGroup: boolean;
}

export interface GuardDecision {
  redirectTo: '/welcome' | '/' | null;
  splashVisible: boolean;
}

export function resolveNavigation({ fontsLoaded, status, inAuthGroup }: GuardInput): GuardDecision {
  const sessionResolved = status !== 'initializing';

  let redirectTo: GuardDecision['redirectTo'] = null;
  if (sessionResolved) {
    if (status === 'unauthenticated' && !inAuthGroup) redirectTo = '/welcome';
    else if (status === 'authenticated' && inAuthGroup) redirectTo = '/';
  }

  const splashVisible = !fontsLoaded || !sessionResolved || redirectTo !== null;
  return { redirectTo, splashVisible };
}
