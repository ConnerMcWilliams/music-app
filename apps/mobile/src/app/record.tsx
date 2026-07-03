import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen } from '@/components';
import { MusicView } from '@/components/practice';
import { getExerciseById, getTodayExercise } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * Recording screen — reached from the Practice screen's "Switch to Record Mode"
 * button with the same `exerciseId`, so the selected study carries over.
 *
 * This is the app's existing recording flow (record live / study first / upload
 * audio → graded result); it is unchanged apart from now rendering the shared
 * {@link MusicView} instead of an inline copy of the sheet music.
 */
export default function RecordScreen() {
  const params = useLocalSearchParams<{ exerciseId?: string }>();
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : undefined;
  const exercise = exerciseId ? getExerciseById(exerciseId) : getTodayExercise();

  // Mock "submit a take" — both the record button and the upload tile route to
  // the graded result. No real capture happens here.
  // TODO(recording): integrate live capture via `src/lib/recording.ts`.
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
          <Text style={styles.eyebrow}>NOW RECORDING</Text>
          <Text style={styles.headerTitle}>
            {exercise ? `Clarke Study No. ${exercise.number}` : 'Study unavailable'}
          </Text>
        </View>
      </View>

      {/* Sheet music surface — same component as the Practice screen. */}
      <MusicView exercise={exercise} />

      {/* Tempo reference */}
      {exercise && (
        <View style={styles.tempoRow}>
          <Icon name="metronome" size={20} color={Colors.gold} />
          <Text style={styles.tempoLabel}>Tempo</Text>
          <Text style={styles.tempo}>{exercise.tempo}</Text>
        </View>
      )}

      {/* Record */}
      <View style={styles.recordBlock}>
        <Text style={styles.timer}>00:00</Text>
        <Pressable
          onPress={submitTake}
          disabled={!exercise}
          accessibilityRole="button"
          accessibilityLabel="Record live"
          style={({ pressed }) => pressed && styles.pressed}>
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

  tempoRow: {
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
  tempoLabel: {
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
