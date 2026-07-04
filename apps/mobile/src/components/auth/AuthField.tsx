import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { Icon } from '@/components';
import { Colors, Fonts, Radius } from '@/theme';

interface AuthFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Inline validation / server error for this field. */
  error?: string;
  /** Render a show/hide toggle and mask input (passwords). */
  secure?: boolean;
}

/**
 * Labeled text input with inline error text and an optional password-visibility
 * toggle. Styled to match the dark/gold design tokens.
 */
export function AuthField({ label, error, secure = false, ...inputProps }: AuthFieldProps) {
  const [hidden, setHidden] = useState(secure);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          {...inputProps}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={Colors.textMutedDark}
          style={styles.input}
        />
        {secure && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Icon name={hidden ? 'eye' : 'eye-off'} size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 12.5,
    letterSpacing: 0.3,
    color: Colors.textMuted,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorderAlt,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
  },
  inputRowError: { borderColor: 'rgba(214,120,120,.6)' },
  input: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15.5,
    color: Colors.textCream,
    paddingVertical: 13,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#E39B9B',
  },
});
