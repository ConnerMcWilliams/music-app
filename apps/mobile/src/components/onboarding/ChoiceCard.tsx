import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components';
import { Colors, Fonts, Radius } from '@/theme';

interface ChoiceCardProps {
  label: string;
  /** Optional supporting line — e.g. what a goal actually changes. */
  hint?: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * One option in a single-choice onboarding step.
 *
 * Styled after `SectionCard` (surface fill, hairline border, gold when active)
 * so the flow looks like the rest of the app. Uses `accessibilityRole="radio"`
 * because these are mutually exclusive within a step.
 */
export function ChoiceCard({ label, hint, selected, onPress }: ChoiceCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.text}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {selected && <Icon name="check" size={18} color={Colors.gold} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardSelected: { borderColor: Colors.goldBorderStrong, backgroundColor: Colors.surfaceAlt },
  pressed: { opacity: 0.75 },
  text: { flex: 1, gap: 3 },
  label: { fontFamily: Fonts.sansMedium, fontSize: 15.5, color: Colors.textCream },
  labelSelected: { fontFamily: Fonts.sansSemibold, color: Colors.gold },
  hint: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },
});
