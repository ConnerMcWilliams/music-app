import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Best-effort screen-orientation control.
 *
 * The app is portrait everywhere except the fullscreen music view, where
 * landscape roughly doubles the size of the notation. `app.json` therefore
 * declares `orientation: "default"` (iOS will not rotate to an orientation it
 * hasn't declared, whatever the runtime asks for) and the portrait lock is
 * applied here at runtime instead — see `src/app/_layout.tsx`.
 *
 * Every call is swallowed on failure. `expo-screen-orientation` is a native
 * module, so a JS-only reload against a dev build made before it was added
 * would otherwise throw; degrading to "stays portrait" is strictly better than
 * crashing the screen that asked. It is also a no-op on web.
 */

/** Pin the app to portrait. The default for every screen. */
export async function lockPortrait(): Promise<void> {
  try {
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
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
  } catch {
    // Rotation is an enhancement; portrait fullscreen is still fully usable.
  }
}
