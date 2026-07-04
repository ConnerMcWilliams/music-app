import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen } from '@/components';
import { MusicXmlView } from '@/components/practice';
import { getExerciseById, getMusicXmlForExercise, getTodayExercise } from '@/data';
import { submitTakeForGrading, type TakeUpload } from '@/services/api';
import { setLastGradingResult } from '@/services/lastGradingResult';
import { Colors, Fonts, Radius } from '@/theme';

/** The captured audio, before it's tied to an exercise for submission. */
type Take = Omit<TakeUpload, 'exerciseId' | 'exerciseTitle'>;

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'review'; take: Take }
  | { kind: 'submitting'; take: Take };

/**
 * Recording screen — reached from the Practice screen's "Switch to Record Mode"
 * button with the same `exerciseId`, so the selected study carries over.
 *
 * Flow: record live (or upload a file) → review → submit to the backend for
 * grading → Results tab shows the returned grade. "Retry" discards the take.
 */
export default function RecordScreen() {
  const params = useLocalSearchParams<{ exerciseId?: string }>();
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : undefined;
  const exercise = exerciseId ? getExerciseById(exerciseId) : getTodayExercise();
  const musicXml = getMusicXmlForExercise(exercise?.id);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Poll fast enough that the timer ticks every second without visible lag.
  const recorderState = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const startRecording = async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is needed to record. Enable it in Settings.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase({ kind: 'recording' });
  };

  const stopRecording = async () => {
    const durationSeconds = recorderState.durationMillis / 1000;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) {
      setPhase({ kind: 'idle' });
      setError('Recording failed — no audio was captured.');
      return;
    }
    setPhase({
      kind: 'review',
      take: {
        uri: recorder.uri,
        // On web the recorder emits a blob: URL whose type travels with the blob.
        mimeType: Platform.OS === 'web' ? undefined : 'audio/m4a',
        durationSeconds,
      },
    });
  };

  const pickAudio = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPhase({
      kind: 'review',
      take: { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.name },
    });
  };

  const submitTake = async (take: Take) => {
    if (!exercise) return;
    setPhase({ kind: 'submitting', take });
    setError(null);
    try {
      const result = await submitTakeForGrading({
        ...take,
        exerciseId: exercise.id,
        exerciseTitle: `Clarke Study No. ${exercise.number}`,
      });
      setLastGradingResult(result);
      setPhase({ kind: 'idle' });
      router.push('/results');
    } catch {
      setPhase({ kind: 'review', take });
      setError('Couldn’t reach the grading service. Is the backend running?');
    }
  };

  const discardTake = () => {
    setError(null);
    setPhase({ kind: 'idle' });
  };

  const timerMillis =
    phase.kind === 'recording'
      ? recorderState.durationMillis
      : phase.kind === 'review' || phase.kind === 'submitting'
        ? (phase.take.durationSeconds ?? 0) * 1000
        : 0;

  const eyebrow = {
    idle: 'RECORD A TAKE',
    recording: 'NOW RECORDING',
    review: 'REVIEW YOUR TAKE',
    submitting: 'SUBMITTING',
  }[phase.kind];

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
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.headerTitle}>
            {exercise ? `Clarke Study No. ${exercise.number}` : 'Study unavailable'}
          </Text>
        </View>
      </View>

      {/* Sheet music surface — same component as the Practice screen. */}
      <MusicXmlView exercise={exercise} musicXml={musicXml} />

      {/* Tempo reference */}
      {exercise && (
        <View style={styles.tempoRow}>
          <Icon name="metronome" size={20} color={Colors.gold} />
          <Text style={styles.tempoLabel}>Tempo</Text>
          <Text style={styles.tempo}>{exercise.tempo}</Text>
        </View>
      )}

      {/* Capture / review block */}
      <View style={styles.recordBlock}>
        <Text style={styles.timer}>{formatTimer(timerMillis)}</Text>

        {(phase.kind === 'idle' || phase.kind === 'recording') && (
          <>
            <Pressable
              onPress={phase.kind === 'recording' ? stopRecording : startRecording}
              disabled={!exercise}
              accessibilityRole="button"
              accessibilityLabel={phase.kind === 'recording' ? 'Stop recording' : 'Record live'}
              style={({ pressed }) => pressed && styles.pressed}>
              <LinearGradient
                colors={[Colors.goldGlow, Colors.goldDeep]}
                start={{ x: 0.35, y: 0.3 }}
                end={{ x: 1, y: 1 }}
                style={styles.recordButton}>
                <Icon
                  name={phase.kind === 'recording' ? 'stop' : 'mic-large'}
                  size={34}
                  color={Colors.textOnCream}
                />
              </LinearGradient>
            </Pressable>
            <Text style={styles.recordHint}>
              {phase.kind === 'recording' ? 'Recording — tap to stop' : 'Tap to record live'}
            </Text>
          </>
        )}

        {(phase.kind === 'review' || phase.kind === 'submitting') && (
          <>
            <View style={styles.reviewActions}>
              <Pressable
                onPress={discardTake}
                disabled={phase.kind === 'submitting'}
                accessibilityRole="button"
                accessibilityLabel="Retry"
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
              <Pressable
                onPress={() => submitTake(phase.take)}
                disabled={phase.kind === 'submitting'}
                accessibilityRole="button"
                accessibilityLabel="Submit for grading"
                style={({ pressed }) => [styles.submitWrap, pressed && styles.pressed]}>
                <LinearGradient
                  colors={Colors.goldGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}>
                  {phase.kind === 'submitting' ? (
                    <ActivityIndicator color={Colors.textOnCream} />
                  ) : (
                    <Text style={styles.submitText}>Submit</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
            <Text style={styles.recordHint}>
              {phase.kind === 'submitting'
                ? 'Sending for grading…'
                : (phase.take.fileName ?? 'Ready to submit')}
            </Text>
          </>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* Secondary options */}
      <View style={styles.options}>
        <OptionTile
          icon="headphones"
          label="Study first"
          disabled={phase.kind === 'recording' || phase.kind === 'submitting'}
          onPress={() =>
            router.push({ pathname: '/practice', params: exerciseId ? { exerciseId } : {} })
          }
        />
        <OptionTile
          icon="upload"
          label="Upload audio"
          disabled={phase.kind === 'recording' || phase.kind === 'submitting'}
          onPress={pickAudio}
        />
      </View>
    </Screen>
  );
}

function formatTimer(millis: number): string {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function OptionTile({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'headphones' | 'upload';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.optionTile,
        pressed && styles.pressed,
        disabled && styles.optionDisabled,
      ]}>
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
  errorText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12.5,
    color: Colors.gold,
    textAlign: 'center',
    maxWidth: 280,
  },

  reviewActions: { flexDirection: 'row', gap: 11, alignSelf: 'stretch' },
  retryBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126,147,172,.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontFamily: Fonts.sansSemibold, fontSize: 13.5, color: Colors.iconLight },
  submitWrap: { flex: 1 },
  submitBtn: {
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontFamily: Fonts.sansBold, fontSize: 13.5, color: Colors.textOnCream },

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
  optionDisabled: { opacity: 0.5 },
  optionLabel: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.iconLight },
});
