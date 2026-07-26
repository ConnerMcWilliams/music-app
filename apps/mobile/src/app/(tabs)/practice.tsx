import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen } from '@/components';
import {
  AnalyticalModeControls,
  BeatAccentSelector,
  BeatIndicator,
  MetronomeControls,
  MusicXmlView,
} from '@/components/practice';
import { getExerciseById, getMusicXmlForExercise } from '@/data';
import { parseTempoBpm } from '@/lib/analysis';
import { buildTimeline, parseMusicXML } from '@/lib/musicxml';
import { useLiveAnalysis } from '@/hooks/useLiveAnalysis';
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

  // Tab screens stay mounted, so refresh on focus — a no-param open keeps
  // agreeing with the Home card after a graded take passes the current study.
  const { refetch } = today;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Parse/validate at the screen boundary. A tab open has no id (use today's
  // study, same as the Home card); an explicit-but-unknown id is an invalid study.
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : undefined;
  const exercise = exerciseId ? getExerciseById(exerciseId) : today.exercise;
  const invalidStudy = exerciseId != null && exercise == null;
  const musicXml = getMusicXmlForExercise(exercise?.id);

  const metronome = useMetronome();
  const analysis = useLiveAnalysis(metronome);

  // The expected performance the live overlay judges against. Parsed once per
  // study; `buildTimeline` already returns sounding pitch, so nothing here
  // needs to know about B♭ transposition.
  const timeline = useMemo(
    () => (musicXml ? buildTimeline(parseMusicXML(musicXml)) : []),
    [musicXml],
  );

  // Seed the tempo from the study's own marking so a first run is at least in
  // the right ballpark. Only while idle — never yank the tempo out from under a
  // player who has set their own.
  const markedBpm = parseTempoBpm(exercise?.tempo);
  const { setBpm } = metronome;
  const analysisActive = analysis.isActive;
  useEffect(() => {
    if (markedBpm != null && !analysisActive) setBpm(markedBpm);
  }, [markedBpm, analysisActive, setBpm]);

  const goToRecord = () => {
    if (!exercise) return;
    // Stop the practice metronome (and any live analysis) before leaving so
    // neither runs on Record.
    analysis.disable();
    metronome.stop();
    router.push({ pathname: '/record', params: { exerciseId: exercise.id } });
  };

  // Hand the finished live recording to Record for grading. Live mode captures
  // the audio it judges, so a player who liked their run grades *that* run
  // instead of playing it again. Absent when the session left no usable file
  // (web, a mic failure, or a rotated multi-part recording).
  const liveTake = analysis.lastSummary?.take ?? null;
  const submitLiveTake =
    exercise && liveTake
      ? () => {
          analysis.disable();
          metronome.stop();
          router.push({
            pathname: '/record',
            params: {
              exerciseId: exercise.id,
              takeUri: liveTake.uri,
              takeDuration: String(liveTake.durationSeconds),
            },
          });
        }
      : undefined;

  const analysisState = analysis.state;

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

      {/* Music view — identical component/size/styling to the Record screen,
          plus the live verdict overlay while analytical mode is running. */}
      <MusicXmlView
        exercise={exercise}
        musicXml={musicXml}
        noteStates={analysisState.verdicts}
        activeNoteIndex={analysis.isActive ? analysisState.activeNoteIndex : undefined}
        followActiveNote={analysis.isActive}
      />

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

          {/* Live feedback — needs notation to judge against. */}
          <AnalyticalModeControls
            isActive={analysis.isActive}
            phase={analysisState.phase}
            summary={analysisState.summary}
            error={analysis.error}
            disabledReason={
              timeline.length === 0
                ? 'This study doesn’t have notation yet, so there’s nothing to check your playing against.'
                : undefined
            }
            onToggle={() => analysis.toggle(timeline)}
            onSubmitTake={submitLiveTake}
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
