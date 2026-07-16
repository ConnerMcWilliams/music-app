import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/theme';

/** Hairline — "or" — hairline, separating Google sign-in from the email form. */
export function OrDivider() {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>or</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.mutedBorderAlt },
  label: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.textMuted },
});
