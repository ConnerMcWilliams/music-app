/**
 * Native Google Sign-In flow, isolated from the rest of the auth stack.
 *
 * This is the only module that touches `@react-native-google-signin` —
 * `AuthContext` and screens consume `getGoogleIdToken`/`googleSignOut`, so a
 * future SDK swap (e.g. to Android's Credential Manager) is a one-file change.
 *
 * The SDK is `require`d lazily inside the exported functions rather than
 * imported at module scope: its native spec runs
 * `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` on load, which throws
 * on any binary that predates this feature (a stale dev client, Expo Go). A
 * top-level import would crash the whole app at startup — since `AuthContext`
 * pulls in the `services/auth` barrel — instead of failing only when the user
 * actually taps the Google button. Types are imported type-only, so they erase
 * at compile time and never touch the native module.
 *
 * The flow yields a Google **ID token** only; the backend verifies it and
 * mints the app's own JWT session (`authClient.loginWithGoogle`). Google
 * access/refresh tokens are never requested or stored.
 */
import type * as GoogleSigninModule from '@react-native-google-signin/google-signin';

import { AuthError } from './errors';

type GoogleSigninApi = typeof GoogleSigninModule;

let sdk: GoogleSigninApi | null = null;
let configured = false;

/** Load and configure the native SDK on first use (throws if unsupported). */
function loadSdk(): GoogleSigninApi {
  if (!sdk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('@react-native-google-signin/google-signin') as GoogleSigninApi;
  }
  if (!configured) {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId) {
      // Without the web client ID Google returns no ID token at all, so treat a
      // missing env value as "this build doesn't support Google sign-in".
      throw new AuthError('Google sign-in is not set up for this build.');
    }
    sdk.GoogleSignin.configure({
      webClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    configured = true;
  }
  return sdk;
}

/**
 * Run the native Google account-picker flow and return the resulting ID token.
 * @returns the ID token, or null when the user dismissed the picker (callers
 *          must treat null as a silent no-op, not an error).
 */
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleSignin, isErrorWithCode, statusCodes } = loadSdk();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const resp = await GoogleSignin.signIn();
    if (resp.type === 'cancelled') return null;
    if (!resp.data.idToken) {
      throw new AuthError('Google sign-in failed. Please try again.');
    }
    return resp.data.idToken;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (isErrorWithCode(err)) {
      // Cancellation is a response type in v16, but keep the legacy code as a
      // defensive net; IN_PROGRESS means a double-tap — let the first call win.
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (err.code === statusCodes.IN_PROGRESS) return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new AuthError('Google Play services is unavailable or out of date on this device.');
      }
    }
    throw new AuthError('Google sign-in failed. Please try again.');
  }
}

/**
 * Drop the Google SDK's cached account so the account picker shows again on
 * the next sign-in. Best-effort: local sign-out must never fail because
 * Google's SDK did (or was never configured / available in this session).
 */
export async function googleSignOut(): Promise<void> {
  try {
    await loadSdk().GoogleSignin.signOut();
  } catch {
    // Ignore — the app's own session is what actually signs the user out, and
    // an unsupported binary (no native module) must not block logout.
  }
}
