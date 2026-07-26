# Native builds (Android / iOS)

The mobile app uses Expo's **Continuous Native Generation (CNG)**. The
`apps/mobile/android/` and `apps/mobile/ios/` directories are **generated** from
`app.json` (+ config plugins) and are **git-ignored** (see
`apps/mobile/.gitignore`). They are not committed and must not be hand-edited —
`expo prebuild` owns them.

## Regenerate after any dependency / SDK change

Because the native projects are generated, they can drift out of sync with the
JS dependencies. In particular, an `android/` tree generated under an older Expo
SDK keeps that SDK's native template even after you upgrade `expo` in
`package.json`. **Always regenerate the native project after changing the Expo
SDK or native modules:**

```bash
# from the repo root
pnpm mobile:prebuild        # -> expo prebuild --clean (regenerates android/ + ios/)
```

or directly:

```bash
cd apps/mobile
pnpm exec expo prebuild --clean
```

`--clean` deletes and recreates the native directories from the current
template, so it always produces files matching the installed SDK. Do not run it
if you have intentional, un-committed native changes (this project has none — the
directories are fully generated).

## Symptom this prevents: stale native template

A native project left over from an older SDK fails to compile against the new
one. Example (Expo SDK 56 / React Native 0.85):

```text
apps/mobile/android/app/src/main/java/com/mcsquil/clarkecoach/MainApplication.kt
  Unresolved reference 'ReactNativeHostWrapper'
    import expo.modules.ReactNativeHostWrapper
```

`ReactNativeHostWrapper` is the **pre-SDK-56** pattern. SDK 56 / RN 0.85 uses the
bridgeless `reactHost` pattern instead:

```kotlin
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages
    )
  }
  // ...
}
```

`MainActivity.kt` similarly uses `ReactActivityDelegateWrapper` +
`DefaultReactActivityDelegate` and registers the splash screen via
`SplashScreenManager` (from the `expo-splash-screen` config plugin).

**Fix:** run `pnpm mobile:prebuild`. Do **not** re-add `ReactNativeHostWrapper`
or pin Expo modules backward to keep the old template — that reintroduces the
obsolete API. The current `expo@56` install already generates the correct SDK 56
template.

## Native modules in the JS dependencies

The metronome on the Practice screen uses
[`react-native-audio-api`](https://github.com/software-mansion/react-native-audio-api)
(Software Mansion's Web Audio implementation) for sample-accurate click
scheduling on a native audio thread, and analytical mode uses the same package's
`AudioRecorder` to capture the microphone (see
[`architecture.md`](architecture.md) → *Analytical mode*). This is a **native
module**, so it only runs in a dev/native build — not Expo Go — and its config
plugin is registered in `app.json`:

```jsonc
["react-native-audio-api", {
  "iosBackgroundMode": false,      // metronome must not play in the background
  "androidForegroundService": false,
  "androidPermissions": []
}]
```

`androidPermissions` stays **empty on purpose** even though the app now records:
`RECORD_AUDIO` and the iOS usage string already come from the `expo-audio`
plugin entry (`microphonePermission`), and it is the same OS permission that
capture through this module needs, so analytical mode requests it through
`expo-audio`'s API rather than declaring it twice. Adding the mic needed no
`app.json` change and therefore no prebuild.

Because it ships native code, **regenerate the native projects after installing
or updating it** (`pnpm mobile:prebuild`), same as any native/SDK change. Under
Jest the module is swapped for its shipped mock (see `jest.config.js`), the
metronome service degrades to a silent no-op backend if the native audio context
ever fails to initialize, and analytical mode uses a silent capture backend on
web (which has no recorder) and reports a start failure as screen state rather
than throwing — so JS-only surfaces (tests, web) never crash.

Google Sign-In uses
[`@react-native-google-signin/google-signin`](https://github.com/react-native-google-signin/google-signin)
(the free "Original" API), also a **native module**, with its config plugin in
`app.json`:

```jsonc
["@react-native-google-signin/google-signin", {
  // reversed iOS client ID; PLACEHOLDER until the Google Cloud clients exist
  "iosUrlScheme": "com.googleusercontent.apps.PLACEHOLDER-IOS-CLIENT-ID"
}]
```

Because it ships native code, **rebuild the dev client after installing it**
(`pnpm mobile:prebuild`, then an `eas build --profile development`); it will
throw at startup on a binary that predates it, so the SDK is `require`d lazily
and never runs in Expo Go. Under Jest it is swapped for a hand-written mock
(`tests/mocks/google-signin.ts`). The full Google Cloud Console setup (client
IDs, `iosUrlScheme`, env vars) lives in
[`authentication.md`](authentication.md).

## App identity

The Android package and iOS bundle identifier come from `app.json`:

```jsonc
"ios":     { "bundleIdentifier": "com.mcsquil.clarkecoach" },
"android": { "package": "com.mcsquil.clarkecoach" }
```

Changing these is a `prebuild --clean` regeneration — the generated native
directories move to the new package path.

## Verifying a native Android build (local, Windows/macOS/Linux with the SDK)

Requires **JDK 17+** and the **Android SDK** (not available in the WSL CI/dev
environment). Compile-only and assemble checks:

```bash
cd apps/mobile/android
./gradlew app:compileDebugKotlin --stacktrace --console plain
./gradlew app:assembleDebug -x lint -x test --console plain -PreactNativeArchitectures=<abi>
```

On Windows use `.\gradlew.bat`. `assembleDebug` succeeding proves the compile is
fixed without needing an emulator. See `docs/ci.md` for why native builds are not
run in CI.
