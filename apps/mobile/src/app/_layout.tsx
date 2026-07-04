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
import { Colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
 * flashed to a logged-in one).
 */
function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === '(auth)';
  const { redirectTo, splashVisible } = resolveNavigation({ fontsLoaded, status, inAuthGroup });

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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="section" />
      <Stack.Screen name="record" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
