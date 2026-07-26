import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components';
import type { LiveAnalysisPhase, NoteSummaryCounts } from '@/lib/analysis';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * Analytical-mode transport and live tally.
 *
 * Presentational: all audio, timing, and judging live in `useLiveAnalysis`; this
 * renders what it reports and calls `onToggle`.
 *
 * One button, not two, because analytical mode is tempo-locked — the metronome
 * *is* the clock it judges against, so starting the two separately would only
 * offer the user a broken combination.
 *
 * The headphone hint is a usage note, not an error: on a speaker the microphone
 * hears the click, which costs spurious verdicts and leaves input latency
 * uncorrected (see the `micBackend` module header). It reads as advice, never
 * blocks a session, and steps aside once one is running.
 */
interface AnalyticalModeControlsProps {
  isActive: boolean;
  phase: LiveAnalysisPhase;
  summary: NoteSummaryCounts;
  /** Microphone problem, surfaced verbatim. */
  error?: string;
  /** Set when the study can't be analysed (no notation). */
  disabledReason?: string;
  onToggle: () => void;
  /**
   * Offered once a finished session left a usable recording. Live mode captures
   * the same audio it judges, so this grades the run just played instead of
   * asking for it again. Absent when the session produced no single file.
   */
  onSubmitTake?: () => void;
}

const PHASE_LABEL: Record<LiveAnalysisPhase, string> = {
  idle: 'Ready',
  preparing: 'Preparing…',
  'count-in': 'Count in…',
  listening: 'Listening',
  finished: 'Done',
  error: 'Unavailable',
};

export function AnalyticalModeControls({
  isActive,
  phase,
  summary,
  error,
  disabledReason,
  onToggle,
  onSubmitTake,
}: AnalyticalModeControlsProps) {
  const disabled = disabledReason != null;
  // Only between runs: mid-session the recording isn't finished.
  const canSubmit = onSubmitTake != null && !isActive && !disabled;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Icon name="mic" size={18} color={Colors.gold} />
        <Text style={styles.title}>Analytical Mode</Text>
        <View style={styles.spacer} />
        <Text style={styles.phase}>{disabled ? 'Unavailable' : PHASE_LABEL[phase]}</Text>
      </View>

      <Text style={styles.blurb}>
        Play along with the metronome and the notes turn green when you land them.
      </Text>

      {disabled ? (
        <Text style={styles.notice}>{disabledReason}</Text>
      ) : (
        <View style={styles.tallyRow}>
          <Tally label="Correct" value={summary.correct} color={Colors.noteCorrect} />
          <Tally label="Wrong" value={summary.wrong} color={Colors.noteWrong} />
          <Tally label="Missed" value={summary.missed} color={Colors.noteMissed} />
          <Tally label="Of" value={summary.total} color={Colors.textMuted} />
        </View>
      )}

      {error && !disabled && <Text style={styles.error}>{error}</Text>}

      {!disabled && !isActive && (
        <View style={styles.hintRow}>
          <Icon name="headphones" size={13} color={Colors.textMutedDark} />
          <Text style={styles.hint}>
            Use headphones — the microphone also hears the metronome.
          </Text>
        </View>
      )}

      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: isActive }}
        accessibilityLabel={isActive ? 'Stop analytical mode' : 'Start analytical mode'}
        style={({ pressed }) => [
          styles.transport,
          isActive ? styles.transportStop : styles.transportStart,
          disabled && styles.transportDisabled,
          pressed && !disabled && styles.pressed,
        ]}>
        <Text style={[styles.transportText, isActive && styles.transportTextStop]}>
          {isActive ? 'Stop' : 'Start Analytical Mode'}
        </Text>
      </Pressable>

      {canSubmit && (
        <Pressable
          onPress={onSubmitTake}
          accessibilityRole="button"
          accessibilityLabel="Submit this take for grading"
          style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
          <Text style={styles.submitText}>Submit this take for grading</Text>
        </Pressable>
      )}
    </View>
  );
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyValue, { color }]} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      <Text style={styles.tallyLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
  title: { fontFamily: Fonts.sansSemibold, fontSize: 13, color: Colors.textCream },
  phase: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  blurb: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted, lineHeight: 18 },
  notice: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMutedDim, lineHeight: 18 },
  error: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.noteWrong, lineHeight: 18 },

  // Advice, not a warning: muted like the blurb above it, no accent colour, no
  // border, and gone while a session is running.
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -4 },
  hint: {
    flexShrink: 1,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.textMutedDark,
  },

  tallyRow: { flexDirection: 'row', gap: 8 },
  tally: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(126,147,172,.08)',
  },
  tallyValue: { fontFamily: Fonts.serifBold, fontSize: 20, lineHeight: 24 },
  tallyLabel: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.textMutedDark,
    marginTop: 1,
  },

  transport: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  transportStart: { backgroundColor: 'rgba(228,197,126,.14)', borderColor: Colors.goldBorderStrong },
  transportStop: { backgroundColor: 'rgba(126,147,172,.1)', borderColor: Colors.mutedBorderAlt },
  transportDisabled: { opacity: 0.4 },
  transportText: { fontFamily: Fonts.sansSemibold, fontSize: 15.5, color: Colors.gold },
  transportTextStop: { color: Colors.textCream },

  // Secondary to the transport above it: this is the follow-up to a finished
  // run, not the primary action of the card.
  submit: {
    marginTop: 10,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.goldBorder,
  },
  submitText: { fontFamily: Fonts.sansSemibold, fontSize: 14.5, color: Colors.gold },

  pressed: { opacity: 0.8 },
});
