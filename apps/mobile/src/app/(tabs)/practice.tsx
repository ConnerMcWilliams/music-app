import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path } from 'react-native-svg';

import { Icon, Screen } from '@/components';
import { getExerciseById, getTodayExercise } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';

export default function PracticeScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const exercise = getExerciseById(exerciseId) ?? getTodayExercise();

  // Mock "submit a take" — both the record button and the upload tile route to
  // the graded result. No real capture happens here.
  // TODO(recording): integrate live capture via `src/lib/recording.ts` (expo-av).
  // TODO(upload): integrate file picking + upload via `src/lib/upload.ts`.
  const submitTake = () => router.push('/results');

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={20} color={Colors.iconLight} strokeWidth={1.8} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>NOW PRACTICING</Text>
          <Text style={styles.headerTitle}>Clarke Study No. {exercise.number}</Text>
        </View>
      </View>

      {/* Sheet music surface */}
      <View style={styles.sheet}>
        <View style={styles.sheetTop}>
          <Text style={styles.sheetLabel}>FIRST STUDIES · No. {exercise.number}</Text>
          <Text style={styles.sheetKey}>{exercise.key}</Text>
        </View>
        <SheetMusic />
      </View>

      {/* Metronome */}
      <View style={styles.metronome}>
        <Icon name="metronome" size={20} color={Colors.gold} />
        <Text style={styles.metronomeLabel}>Metronome</Text>
        <Text style={styles.tempo}>{exercise.tempo}</Text>
      </View>

      {/* Record */}
      <View style={styles.recordBlock}>
        <Text style={styles.timer}>00:00</Text>
        <Pressable onPress={submitTake} style={({ pressed }) => pressed && styles.pressed}>
          <LinearGradient
            colors={[Colors.goldGlow, Colors.goldDeep]}
            start={{ x: 0.35, y: 0.3 }}
            end={{ x: 1, y: 1 }}
            style={styles.recordButton}>
            <Icon name="mic-large" size={34} color={Colors.textOnCream} />
          </LinearGradient>
        </Pressable>
        <Text style={styles.recordHint}>Tap to record live</Text>
      </View>

      {/* Upload options */}
      <View style={styles.options}>
        <OptionTile icon="headphones" label="Study first" onPress={submitTake} />
        <OptionTile icon="upload" label="Upload audio" onPress={submitTake} />
      </View>
    </Screen>
  );
}

function OptionTile({
  icon,
  label,
  onPress,
}: {
  icon: 'headphones' | 'upload';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.optionTile, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={Colors.iconLight} strokeWidth={1.6} />
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

/** Decorative staff with a slurred phrase — mirrors the design's inline SVG. */
function SheetMusic() {
  const heads = [
    [58, 62],
    [82, 56],
    [106, 50],
    [130, 44],
    [170, 38],
    [194, 44],
    [218, 50],
    [242, 56],
  ];
  return (
    <Svg width="100%" height={84} viewBox="0 0 300 84">
      <G stroke="#3A4658" strokeWidth={1} opacity={0.7}>
        {[20, 32, 44, 56, 68].map((y) => (
          <Line key={y} x1={6} y1={y} x2={294} y2={y} />
        ))}
      </G>
      <Path
        d="M22 70c0-10 4-16 4-26 0-7-7-9-7-3 0 5 6 6 8 1 3-8-2-16-5-16"
        stroke={Colors.textInk}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <Line x1={150} y1={14} x2={150} y2={74} stroke="#3A4658" strokeWidth={1} opacity={0.5} />
      <Line x1={294} y1={14} x2={294} y2={74} stroke="#3A4658" strokeWidth={1.4} opacity={0.7} />
      <G fill={Colors.textInk}>
        {heads.map(([cx, cy], i) => (
          <Ellipse key={i} cx={cx} cy={cy} rx={5.2} ry={3.8} transform={`rotate(-20 ${cx} ${cy})`} />
        ))}
      </G>
      <G stroke={Colors.textInk} strokeWidth={1.3}>
        {heads.map(([cx, cy], i) => (
          <Line key={i} x1={cx + 4.5} y1={cy - 1} x2={cx + 4.5} y2={cy - 22} />
        ))}
      </G>
      <Path d="M58 70q36 14 72 0" stroke={Colors.goldDeep} strokeWidth={1.6} fill="none" />
      <Path d="M170 70q36 14 72 0" stroke={Colors.goldDeep} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(126,147,172,.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: Colors.textMuted,
  },
  headerTitle: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 16,
    color: Colors.textCream,
    marginTop: 1,
  },
  pressed: { opacity: 0.8 },

  sheet: {
    backgroundColor: Colors.creamGradient[0],
    borderRadius: Radius.xl,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#080F1C',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  sheetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: Colors.goldLabel,
  },
  sheetKey: { fontFamily: Fonts.sansSemibold, fontSize: 11, color: '#5A6472' },

  metronome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  metronomeLabel: {
    flex: 1,
    fontFamily: Fonts.sansSemibold,
    fontSize: 13,
    color: Colors.textCream,
  },
  tempo: { fontFamily: Fonts.serifBold, fontSize: 20, color: Colors.gold },

  recordBlock: { alignItems: 'center', gap: 9, marginTop: 2 },
  timer: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    letterSpacing: 1,
    color: Colors.textCream,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: 'rgba(201,162,74,.14)',
    shadowColor: Colors.goldDeep,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  recordHint: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted },

  options: { flexDirection: 'row', gap: 11, marginTop: 2 },
  optionTile: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorderAlt,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  optionLabel: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.iconLight },
});
