import { resolveNavigation } from '@/lib/auth/routeGuard';

describe('route guard', () => {
  it('keeps the splash up and issues no redirect while initializing', () => {
    // This is the anti-flash guarantee: before the session resolves, neither the
    // protected app nor the login screen is shown.
    const decision = resolveNavigation({
      fontsLoaded: true,
      status: 'initializing',
      inAuthGroup: false,
    });
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(true);
  });

  it('sends a logged-out user on a protected route to /login', () => {
    const decision = resolveNavigation({
      fontsLoaded: true,
      status: 'unauthenticated',
      inAuthGroup: false,
    });
    expect(decision.redirectTo).toBe('/login');
    // Splash stays up so the protected screen isn't flashed pre-redirect.
    expect(decision.splashVisible).toBe(true);
  });

  it('does not redirect a logged-out user already in the auth group', () => {
    const decision = resolveNavigation({
      fontsLoaded: true,
      status: 'unauthenticated',
      inAuthGroup: true,
    });
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(false);
  });

  it('sends a logged-in user sitting on the auth screens to the app', () => {
    const decision = resolveNavigation({
      fontsLoaded: true,
      status: 'authenticated',
      inAuthGroup: true,
    });
    expect(decision.redirectTo).toBe('/');
    expect(decision.splashVisible).toBe(true);
  });

  it('shows the app to an authenticated user on a protected route with no redirect', () => {
    const decision = resolveNavigation({
      fontsLoaded: true,
      status: 'authenticated',
      inAuthGroup: false,
    });
    expect(decision.redirectTo).toBeNull();
    expect(decision.splashVisible).toBe(false);
  });

  it('keeps the splash up until fonts have loaded', () => {
    const decision = resolveNavigation({
      fontsLoaded: false,
      status: 'authenticated',
      inAuthGroup: false,
    });
    expect(decision.splashVisible).toBe(true);
  });
});
