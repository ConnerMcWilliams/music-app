import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Radius } from '@/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  /** Shows a spinner and blocks presses (prevents duplicate submissions). */
  loading?: boolean;
  disabled?: boolean;
}

/** Gold gradient CTA used for the auth submit actions. */
export function PrimaryButton({ label, onPress, loading = false, disabled = false }: PrimaryButtonProps) {
  const blocked = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={({ pressed }) => [styles.pressable, pressed && !blocked && styles.pressed]}>
      <LinearGradient
        colors={Colors.goldGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, blocked && styles.buttonBlocked]}>
        {loading ? (
          <ActivityIndicator color={Colors.textOnCream} />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { borderRadius: Radius.md },
  pressed: { opacity: 0.85 },
  button: {
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonBlocked: { opacity: 0.55 },
  label: {
    fontFamily: Fonts.sansBold,
    fontSize: 15.5,
    letterSpacing: 0.3,
    color: Colors.textOnCream,
  },
});
