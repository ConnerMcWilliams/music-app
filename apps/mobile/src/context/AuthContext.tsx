/**
 * Centralized authentication state for the app.
 *
 * Single source of truth for "who is signed in and are we sure yet". Screens
 * read `status`/`user` and call `signIn`/`signUp`/`signInWithGoogle`/`signOut`;
 * token reading, refresh, and storage all live in `services/auth` — never in
 * screens.
 *
 * `status` drives route protection (see the root layout):
 *  - "initializing" → still restoring a persisted session; render a splash and
 *    show neither the auth screens nor the protected app (no content flash).
 *  - "authenticated" / "unauthenticated" → resolved.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  authClient,
  type AuthUser,
  getGoogleIdToken,
  googleSignOut,
  type SignUpInput,
} from '@/services/auth';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  /** Native Google flow; resolves with NO state change if the user cancels. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Restore any persisted session exactly once on mount. A transient network
  // failure leaves the stored tokens in place and simply lands the user on the
  // sign-in screen; a definitively invalid session is cleared by the client.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const restored = await authClient.restoreSession();
        if (!active) return;
        setUser(restored);
        setStatus(restored ? 'authenticated' : 'unauthenticated');
      } catch {
        // NetworkError during restore — we can't confirm the session, so treat
        // as unauthenticated for now without wiping the (possibly valid) tokens.
        if (!active) return;
        setStatus('unauthenticated');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async signIn(email, password) {
        const signedIn = await authClient.login(email, password);
        setUser(signedIn);
        setStatus('authenticated');
      },
      async signUp(input) {
        const created = await authClient.register(input);
        setUser(created);
        setStatus('authenticated');
      },
      async signInWithGoogle() {
        const idToken = await getGoogleIdToken();
        if (!idToken) return; // picker dismissed — stay signed out, no error
        const signedIn = await authClient.loginWithGoogle(idToken);
        setUser(signedIn);
        setStatus('authenticated');
      },
      async signOut() {
        // Also drop Google's cached account (best-effort, never throws) so the
        // account picker reappears on the next Google sign-in.
        await Promise.all([authClient.logout(), googleSignOut()]);
        setUser(null);
        setStatus('unauthenticated');
      },
      async refreshUser() {
        const fresh = await authClient.fetchMe();
        setUser(fresh);
        setStatus('authenticated');
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
