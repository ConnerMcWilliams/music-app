import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Icon, LoadingState, Screen, ScoreRing } from '@/components';
import { MOCK_GRADING_RESULT } from '@/data';
import { getLastGradingResult } from '@/services/lastGradingResult';
import { Colors, Fonts, Radius } from '@/theme';
import type { GradingCategory, GradingResult } from '@/types';
import { useMockQuery } from '@/hooks/useMockQuery';

export default function ResultsScreen() {
  // The grade for a just-submitted take (or a tapped past submission) arrives via
  // the hand-off store. Results is a persistent tab, so `router.push('/results')`
  // only re-focuses it — re-read the store on every focus so tapping a different
  // recording shows *that* take, not the one first rendered.
  const [submitted, setSubmitted] = useState<GradingResult | null>(() =>
    getLastGradingResult(),
  );
  useFocusEffect(
    useCallback(() => {
      setSubmitted(getLastGradingResult());
    }, []),
  );

  // Direct visits to the tab (nothing submitted yet) still show the mock
  // result behind a simulated fetch. TODO(api): fetch the user's latest
  // graded submission instead.
  const { data, loading, refetch } = useMockQuery(() => MOCK_GRADING_RESULT, {
    delayMs: 900,
  });

  if (!submitted && loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centerFill}>
        <LoadingState message="Grading your recording…" />
      </Screen>
    );
  }

  const result = submitted ?? data;
  if (!result) {
    return (
      <Screen scroll={false} contentStyle={styles.centerFill}>
        <ErrorState message="We couldn’t grade this take." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>GRADED · {result.exerciseTitle.toUpperCase()}</Text>
        <Text style={styles.title}>Your Results</Text>
      </View>

      {/* Level-up celebration (fresh takes that crossed a level threshold). */}
      {result.leveledUp ? (
        <View style={styles.levelUpBanner}>
          <Icon name="award" size={16} color={Colors.good} />
          <Text style={styles.levelUpText}>
            Level up! You’re now Level {result.level} · {result.rankTitle}
            {result.coinsAwarded ? ` · +${result.coinsAwarded} coins` : ''}
          </Text>
        </View>
      ) : null}

      {/* Score ring */}
      <View style={styles.ringWrap}>
        <ScoreRing size={150} strokeWidth={13} progress={result.totalScore / 100}>
          <View style={styles.ringInner}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{result.totalScore}</Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <Text style={styles.gradeLabel}>GRADE {result.gradeLabel}</Text>
          </View>
        </ScoreRing>
      </View>

      {/* XP earned — awarded only for beating this study's prior best. */}
      {result.xpAwarded != null ? (
        <View style={styles.xpChipWrap}>
          {result.xpAwarded > 0 ? (
            <View style={styles.xpChip}>
              <Text style={styles.xpChipText}>+{result.xpAwarded} XP · New best!</Text>
            </View>
          ) : (
            <View style={styles.xpChipMuted}>
              <Text style={styles.xpChipMutedText}>Beat your best to earn XP</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Replay the stored recording (only when viewing a past submission). */}
      {result.audioUrl ? <RecordingPlayer uri={result.audioUrl} /> : null}

      {/* Breakdown */}
      <View style={styles.breakdown}>
        {result.categories.map((c) => (
          <CategoryBar key={c.label} category={c} />
        ))}
      </View>

      {/* Teacher feedback */}
      <View style={styles.feedback}>
        <View style={styles.feedbackHead}>
          <LinearGradient
            colors={Colors.avatarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.feedbackAvatar}>
            <Text style={styles.feedbackInitials}>{result.feedbackInitials}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.feedbackAuthor}>{result.feedbackAuthor}</Text>
            <Text style={styles.feedbackRole}>Coaching feedback</Text>
          </View>
        </View>
        <Text style={styles.feedbackQuote}>“{result.feedbackText}”</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/practice')}
          style={({ pressed }) => [styles.actionOutline, pressed && styles.pressed]}>
          <Text style={styles.actionOutlineText}>Practice again</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/')}
          style={({ pressed }) => [styles.actionPrimaryWrap, pressed && styles.pressed]}>
          <LinearGradient
            colors={Colors.goldGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionPrimary}>
            <Text style={styles.actionPrimaryText}>Save to log</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Screen>
  );
}

/** Play/stop control for a past submission's stored recording. */
function RecordingPlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Restart from the top once a take has played through.
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Stop recording' : 'Play recording'}
      style={({ pressed }) => [styles.player, pressed && styles.pressed]}>
      <View style={styles.playerIcon}>
        <Icon name={status.playing ? 'stop' : 'play'} size={16} color={Colors.gold} />
      </View>
      <Text style={styles.playerLabel}>
        {status.playing ? 'Playing recording…' : 'Play recording'}
      </Text>
    </Pressable>
  );
}

function CategoryBar({ category }: { category: GradingCategory }) {
  return (
    <View>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>{category.label}</Text>
        <Text style={styles.barScore}>{category.score}</Text>
      </View>
      <View style={styles.barTrack}>
        <LinearGradient
          colors={Colors.goldGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${category.score}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, justifyContent: 'center' },
  headerBlock: { alignItems: 'center' },
  eyebrow: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1.8,
    color: Colors.textMuted,
  },
  title: { fontFamily: Fonts.serif, fontSize: 25, color: Colors.textCream, marginTop: 3 },

  levelUpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(159,190,147,.12)',
    borderWidth: 1,
    borderColor: 'rgba(159,190,147,.35)',
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  levelUpText: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 12.5,
    color: Colors.good,
    flexShrink: 1,
  },

  xpChipWrap: { alignItems: 'center' },
  xpChip: {
    backgroundColor: 'rgba(228,197,126,.12)',
    borderWidth: 1,
    borderColor: Colors.goldBorderStrong,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  xpChipText: {
    fontFamily: Fonts.sansBold,
    fontSize: 13,
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  xpChipMuted: {
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  xpChipMutedText: { fontFamily: Fonts.sansSemibold, fontSize: 12, color: Colors.textMuted },

  ringWrap: { alignItems: 'center', marginTop: 2 },
  ringInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: Colors.scoreRingCenter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreValue: { fontFamily: Fonts.serifBold, fontSize: 54, lineHeight: 56, color: Colors.textCream },
  scoreOutOf: { fontFamily: Fonts.sansSemibold, fontSize: 14, color: Colors.textMuted },
  gradeLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: Colors.gold,
    marginTop: 4,
  },

  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(126,147,172,.11)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  playerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(228,197,126,.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerLabel: { fontFamily: Fonts.sansSemibold, fontSize: 13.5, color: Colors.textCream },

  breakdown: { gap: 13, marginTop: 2 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.iconLight },
  barScore: { fontFamily: Fonts.serifBold, fontSize: 13, color: Colors.gold },
  barTrack: { height: 6, borderRadius: 4, backgroundColor: Colors.trackBar, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  feedback: {
    backgroundColor: Colors.creamGradient[0],
    borderRadius: Radius.lg,
    padding: 16,
    paddingTop: 15,
    shadowColor: '#080F1C',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  feedbackAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackInitials: { fontFamily: Fonts.serif, fontSize: 15, color: Colors.gold },
  feedbackAuthor: { fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.textOnCream },
  feedbackRole: { fontFamily: Fonts.sans, fontSize: 11, color: '#8A7A54' },
  feedbackQuote: {
    fontFamily: Fonts.serifItalic,
    fontSize: 16.5,
    lineHeight: 22,
    color: Colors.textOnCreamSoft,
  },

  actions: { flexDirection: 'row', gap: 11, marginTop: 1 },
  actionOutline: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126,147,172,.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionOutlineText: { fontFamily: Fonts.sansSemibold, fontSize: 13.5, color: Colors.iconLight },
  actionPrimaryWrap: { flex: 1 },
  actionPrimary: {
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: { fontFamily: Fonts.sansBold, fontSize: 13.5, color: Colors.textOnCream },
  pressed: { opacity: 0.85 },
});
