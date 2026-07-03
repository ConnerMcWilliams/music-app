import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius } from '@/theme';

/**
 * Lets the user choose *which* beats are accented, rather than a hard-coded
 * first-beat accent. Each beat in the measure is a toggle; accented beats read
 * as filled gold, normal beats as faint outlines. Tapping toggles that beat's
 * flag (`accentedBeats[i]`).
 */
interface BeatAccentSelectorProps {
  accentedBeats: boolean[];
  onToggle: (index: number) => void;
}

export function BeatAccentSelector({ accentedBeats, onToggle }: BeatAccentSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>ACCENTS</Text>
      <View style={styles.row}>
        {accentedBeats.map((accented, i) => (
          <Pressable
            key={i}
            onPress={() => onToggle(i)}
            accessibilityRole="switch"
            accessibilityState={{ checked: accented }}
            accessibilityLabel={`Beat ${i + 1} accent`}
            style={({ pressed }) => [
              styles.cell,
              accented ? styles.cellOn : styles.cellOff,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.cellText, accented ? styles.cellTextOn : styles.cellTextOff]}>
              {i + 1}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { backgroundColor: 'rgba(228,197,126,.14)', borderColor: Colors.goldBorderStrong },
  cellOff: { backgroundColor: Colors.surface, borderColor: Colors.mutedBorderAlt },
  pressed: { opacity: 0.7 },
  cellText: { fontFamily: Fonts.sansSemibold, fontSize: 14 },
  cellTextOn: { color: Colors.gold },
  cellTextOff: { color: Colors.textMuted },
});
