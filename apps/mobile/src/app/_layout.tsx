import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { resolveNavigation } from '@/lib/auth/routeGuard';
import { lockPortrait } from '@/lib/orientation';
import { Colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // `app.json` declares `orientation: "default"` because iOS refuses to rotate
  // to an orientation the binary never declared, and the fullscreen music view
  // needs landscape. The app is still portrait everywhere else — that's this
  // lock, which the expanded score temporarily lifts and restores on close.
  useEffect(() => {
    void lockPortrait();
  }, []);

  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator fontsLoaded={fontsLoaded} />
          <StatusBar style="light" />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Renders the app navigator and enforces route protection.
 *
 * The native splash screen is kept up until (a) fonts are ready, (b) the auth
 * session has finished restoring, and (c) the current route already matches the
 * auth state. Because the splash covers any pending redirect, protected content
 * is never briefly shown to a logged-out user (and the login screen is never
 * flashed to a logged-in one, nor the tabs to a user who still owes onboarding).
 */
function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === 'onboarding';
  const { redirectTo, splashVisible } = resolveNavigation({
    fontsLoaded,
    status,
    inAuthGroup,
    needsOnboarding: user !== null && !user.onboardingCompleted,
    inOnboardingGroup,
  });

  useEffect(() => {
    if (!splashVisible) {
      SplashScreen.hideAsync();
    }
  }, [splashVisible]);

  useEffect(() => {
    // `replace` (not push) so protected routes don't linger behind the login
    // screen, and the back button after signing in doesn't return to auth.
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  // Keep the native splash visible (render nothing) until fonts load, so heading
  // text never renders in a fallback font first.
  if (!fontsLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
      }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="section" />
      <Stack.Screen name="recordings" />
      <Stack.Screen name="record" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
