import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius } from '@/theme';

import { GoogleLogo } from './GoogleLogo';

interface GoogleSignInButtonProps {
  onPress: () => void;
  label?: string;
  /** Shows a spinner and blocks presses (prevents duplicate submissions). */
  loading?: boolean;
  disabled?: boolean;
}

/**
 * "Continue with Google" per Google's sign-in branding: on dark surfaces the
 * light variant is required — white fill, near-black label, untinted "G".
 */
export function GoogleSignInButton({
  onPress,
  label = 'Continue with Google',
  loading = false,
  disabled = false,
}: GoogleSignInButtonProps) {
  const blocked = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        pressed && !blocked && styles.pressed,
        blocked && styles.blocked,
      ]}>
      {loading ? (
        <ActivityIndicator color={GOOGLE_LABEL} />
      ) : (
        <>
          <GoogleLogo size={20} />
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// Google's spec colors for the light button — deliberately not theme tokens.
const GOOGLE_LABEL = '#1F1F1F';

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    paddingVertical: 15,
    minHeight: 52,
  },
  pressed: { opacity: 0.85 },
  blocked: { opacity: 0.55 },
  label: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15.5,
    letterSpacing: 0.2,
    color: GOOGLE_LABEL,
  },
});
