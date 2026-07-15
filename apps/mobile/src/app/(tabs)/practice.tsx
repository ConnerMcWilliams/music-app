import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen } from '@/components';
import { BeatAccentSelector, BeatIndicator, MetronomeControls, MusicXmlView } from '@/components/practice';
import { getExerciseById, getMusicXmlForExercise } from '@/data';
import { useMetronome } from '@/hooks/useMetronome';
import { useTodayStudy } from '@/hooks/useTodayStudy';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * Practice screen — the destination of the Practice tab and of selecting a study.
 *
 * Flow (see the feature spec):
 *   Practice tab            → this screen, today's study
 *   Select a study/exercise → this screen, that study (via `exerciseId` param)
 *   Record button           → the existing recording screen, same study
 *
 * It shows the study's music view (shared with Record) and a precise, accent-
 * configurable metronome. All metronome timing/audio lives behind `useMetronome`
 * → the metronome service; this component only renders and wires handlers.
 */
export default function PracticeScreen() {
  const params = useLocalSearchParams<{ exerciseId?: string }>();
  const today = useTodayStudy();
  // Parse/validate at the screen boundary. A tab open has no id (use today's
  // study, same as the Home card); an explicit-but-unknown id is an invalid study.
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : undefined;
  const exercise = exerciseId ? getExerciseById(exerciseId) : today.exercise;
  const invalidStudy = exerciseId != null && exercise == null;
  const musicXml = getMusicXmlForExercise(exercise?.id);

  const metronome = useMetronome();

  const goToRecord = () => {
    if (!exercise) return;
    // Stop the practice metronome before leaving so it never plays on Record.
    metronome.stop();
    router.push({ pathname: '/record', params: { exerciseId: exercise.id } });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push('/'))}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={20} color={Colors.iconLight} strokeWidth={1.8} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>PRACTICE</Text>
          <Text style={styles.headerTitle}>
            {exercise ? `Clarke Study No. ${exercise.number}` : 'Study unavailable'}
          </Text>
        </View>
      </View>

      {/* Music view — identical component/size/styling to the Record screen. */}
      <MusicXmlView exercise={exercise} musicXml={musicXml} />

      {invalidStudy ? (
        <Text style={styles.invalidNote}>
          Pick a study from the Studies tab to start practicing.
        </Text>
      ) : (
        <>
          {/* Metronome */}
          <BeatIndicator
            beatsPerMeasure={metronome.config.beatsPerMeasure}
            accentedBeats={metronome.config.accentedBeats}
            running={metronome.isRunning}
            subscribe={metronome.subscribe}
          />
          <MetronomeControls
            bpm={metronome.config.bpm}
            beatsPerMeasure={metronome.config.beatsPerMeasure}
            isRunning={metronome.isRunning}
            onToggle={metronome.toggle}
            onIncrement={metronome.incrementBpm}
            onDecrement={metronome.decrementBpm}
            onSetBeatsPerMeasure={metronome.setBeatsPerMeasure}
          />
          <BeatAccentSelector
            accentedBeats={metronome.config.accentedBeats}
            onToggle={metronome.toggleBeatAccent}
          />

          {/* Record mode */}
          <Pressable
            onPress={goToRecord}
            accessibilityRole="button"
            accessibilityLabel="Switch to record mode"
            style={({ pressed }) => pressed && styles.pressed}>
            <LinearGradient
              colors={[Colors.goldGlow, Colors.goldDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.recordButton}>
              <Icon name="mic" size={20} color={Colors.textOnCream} strokeWidth={1.9} />
              <Text style={styles.recordText}>Switch to Record Mode</Text>
            </LinearGradient>
          </Pressable>
        </>
      )}
    </Screen>
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

  invalidNote: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },

  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 8,
    borderColor: 'rgba(201,162,74,.14)',
    shadowColor: Colors.goldDeep,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  recordText: { fontFamily: Fonts.sansSemibold, fontSize: 16, color: Colors.textOnCream },
});
