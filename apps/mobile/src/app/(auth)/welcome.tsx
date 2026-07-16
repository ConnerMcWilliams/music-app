import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components';
import { GoogleSignInButton, SecondaryButton } from '@/components/auth';
import { useAuth } from '@/context/AuthContext';
import { messageForError } from '@/services/auth';
import { Colors, Fonts, Layout } from '@/theme';

/**
 * Landing screen for signed-out users: brand hero plus the two entry points
 * (Google, email). Signing in never navigates manually — the root route guard
 * redirects once auth status flips to "authenticated".
 */
export default function WelcomeScreen() {
  const { signInWithGoogle } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function onGooglePress() {
    if (googleSubmitting) return; // guard against double taps
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      // Resolves silently (no state change, no error) if the picker is dismissed.
      await signInWithGoogle();
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <LinearGradient
      colors={Colors.bgGradient}
      locations={[0, 0.62, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Icon name="logo" size={56} color={Colors.gold} />
            <Text style={styles.appName}>Clarke Coach</Text>
            <Text style={styles.tagline}>Master the Clarke studies, one take at a time.</Text>
          </View>

          <View style={styles.actions}>
            {formError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            {Platform.OS === 'web' ? null : (
              <GoogleSignInButton onPress={onGooglePress} loading={googleSubmitting} />
            )}
            <SecondaryButton
              label="Continue with email"
              onPress={() => router.push('/register')}
              disabled={googleSubmitting}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/login" disabled={googleSubmitting}>
                <Text style={styles.linkText}>Sign in</Text>
              </Link>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingH,
    paddingTop: 24,
    paddingBottom: 28,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  appName: {
    fontFamily: Fonts.serifBold,
    fontSize: 40,
    color: Colors.textCream,
    letterSpacing: 0.4,
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  actions: { gap: 14 },
  errorBanner: {
    backgroundColor: 'rgba(214,120,120,.12)',
    borderWidth: 1,
    borderColor: 'rgba(214,120,120,.4)',
    borderRadius: 12,
    padding: 13,
  },
  errorBannerText: { fontFamily: Fonts.sansMedium, fontSize: 13.5, color: '#E7A9A9' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.textMuted },
  linkText: { fontFamily: Fonts.sansSemibold, fontSize: 14, color: Colors.gold },
});
