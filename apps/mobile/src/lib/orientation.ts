/**
 * Best-effort screen-orientation control.
 *
 * The app is portrait everywhere except the fullscreen music view, where
 * landscape roughly doubles the size of the notation. `app.json` therefore
 * declares `orientation: "default"` (iOS will not rotate to an orientation it
 * hasn't declared, whatever the runtime asks for) and the portrait lock is
 * applied here at runtime instead — see `src/app/_layout.tsx`.
 *
 * `expo-screen-orientation` is `require`d lazily *inside* each call, the same
 * way `services/auth/google.ts` loads its SDK and for the same reason: the
 * package runs `requireNativeModule('ExpoScreenOrientation')` at module scope,
 * which throws on any binary that predates this feature (a stale dev client).
 * A top-level import would throw while `src/app/_layout.tsx` is still being
 * evaluated — before any `try` could run — and take the whole app down. Loading
 * it under the catch is what actually makes both calls degrade to "stays
 * portrait" instead of crashing the screen that asked. It is also a no-op on
 * web.
 */
import type * as ScreenOrientationModule from 'expo-screen-orientation';

type ScreenOrientationApi = typeof ScreenOrientationModule;

let sdk: ScreenOrientationApi | null = null;

/** Load the native module on first use (throws when the binary lacks it). */
function loadSdk(): ScreenOrientationApi {
  if (!sdk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('expo-screen-orientation') as ScreenOrientationApi;
  }
  return sdk;
}

/** Pin the app to portrait. The default for every screen. */
export async function lockPortrait(): Promise<void> {
  try {
    const ScreenOrientation = loadSdk();
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // No native module (or web) — the app.json default already keeps us upright.
  }
}

/**
 * Let the device rotate. Only the fullscreen music view calls this.
 *
 * `DEFAULT`, not `ALL`: the SDK 56 docs note that `ALL` (and `PORTRAIT`) are
 * *invalid* on devices that don't support `PORTRAIT_DOWN`, which is most
 * iPhones. `DEFAULT` means "every orientation but upside-down" on iOS and
 * "let the system decide" on Android — both landscapes plus upright, which is
 * exactly what the expanded score wants.
 */
export async function allowRotation(): Promise<void> {
  try {
    const ScreenOrientation = loadSdk();
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
  } catch {
    // Rotation is an enhancement; portrait fullscreen is still fully usable.
  }
}
