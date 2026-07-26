import { resolveNavigation, type GuardInput } from '@/lib/auth/routeGuard';

/** The common case: onboarded user, not in either special group. */
function guard(overrides: Partial<GuardInput> = {}) {
  return resolveNavigation({
    fontsLoaded: true,
    status: 'authenticated',
    inAuthGroup: false,
    needsOnboarding: false,
    inOnboardingGroup: false,
    ...overrides,
  });
}

describe('route guard', () => {
  it('keeps the splash up and issues no redirect while initializing', () => {
    // This is the anti-flash guarantee: before the session resolves, neither the
    // protected app nor the login screen is shown.
    const decision = guard({ status: 'initializing' });
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(true);
  });

  it('sends a logged-out user on a protected route to /welcome', () => {
    const decision = guard({ status: 'unauthenticated' });
    expect(decision.redirectTo).toBe('/welcome');
    // Splash stays up so the protected screen isn't flashed pre-redirect.
    expect(decision.splashVisible).toBe(true);
  });

  it('does not redirect a logged-out user already in the auth group', () => {
    const decision = guard({ status: 'unauthenticated', inAuthGroup: true });
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(false);
  });

  it('sends a logged-in, onboarded user sitting on the auth screens to the app', () => {
    const decision = guard({ inAuthGroup: true });
    expect(decision.redirectTo).toBe('/');
    expect(decision.splashVisible).toBe(true);
  });

  it('shows the app to an authenticated, onboarded user with no redirect', () => {
    const decision = guard();
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(false);
  });

  it('keeps the splash up until fonts have loaded', () => {
    expect(guard({ fontsLoaded: false }).splashVisible).toBe(true);
  });

  describe('onboarding', () => {
    it('sends a user who still owes onboarding there from the tabs', () => {
      const decision = guard({ needsOnboarding: true });
      expect(decision.redirectTo).toBe('/onboarding');
      // The tabs must not flash before the redirect lands.
      expect(decision.splashVisible).toBe(true);
    });

    it('sends a fresh signup straight from the auth group to onboarding', () => {
      // Onboarding outranks the "logged in, leave the auth group" rule, so a new
      // account never touches the tabs first.
      const decision = guard({ needsOnboarding: true, inAuthGroup: true });
      expect(decision.redirectTo).toBe('/onboarding');
    });

    it('leaves a user who owes onboarding alone once they are in the flow', () => {
      const decision = guard({ needsOnboarding: true, inOnboardingGroup: true });
      expect(decision.redirectTo).toBeNull();
      expect(decision.splashVisible).toBe(false);
    });

    it('does not push a finished user out of the onboarding group', () => {
      // The account screen deep-links back into these screens with `?edit=1` to
      // change one answer; the guard cannot see that param, so it must not
      // bounce a completed user out. The final step navigates to the tabs itself.
      const decision = guard({ inOnboardingGroup: true });
      expect(decision.redirectTo).toBeNull();
      expect(decision.splashVisible).toBe(false);
    });

    it('ignores onboarding entirely for a logged-out user', () => {
      const decision = guard({ status: 'unauthenticated', needsOnboarding: true });
      expect(decision.redirectTo).toBe('/welcome');
    });

    it('issues no redirect while the session is still initializing', () => {
      const decision = guard({ status: 'initializing', needsOnboarding: true });
      expect(decision.redirectTo).toBeNull();
    });
  });
});
