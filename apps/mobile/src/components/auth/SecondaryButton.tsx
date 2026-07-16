import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Radius } from '@/theme';

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Outlined counterpart to `PrimaryButton` for secondary auth actions. */
export function SecondaryButton({ label, onPress, disabled = false }: SecondaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.blocked,
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.goldBorderStrong,
    paddingVertical: 15,
    minHeight: 52,
  },
  pressed: { opacity: 0.7 },
  blocked: { opacity: 0.55 },
  label: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15.5,
    letterSpacing: 0.3,
    color: Colors.textCream,
  },
});
