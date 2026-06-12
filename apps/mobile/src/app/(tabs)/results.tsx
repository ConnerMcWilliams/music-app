import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorState, LoadingState, Screen, ScoreRing } from '@/components';
import { MOCK_GRADING_RESULT } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';
import type { GradingCategory } from '@/types';
import { useMockQuery } from '@/hooks/useMockQuery';

export default function ResultsScreen() {
  // Slightly longer delay to read as "grading the recording".
  const { data, loading, error, refetch } = useMockQuery(() => MOCK_GRADING_RESULT, {
    delayMs: 900,
  });

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centerFill}>
        <LoadingState message="Grading your recording…" />
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen scroll={false} contentStyle={styles.centerFill}>
        <ErrorState message="We couldn’t grade this take." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>GRADED · {data.exerciseTitle.toUpperCase()}</Text>
        <Text style={styles.title}>Your Results</Text>
      </View>

      {/* Score ring */}
      <View style={styles.ringWrap}>
        <ScoreRing size={150} strokeWidth={13} progress={data.totalScore / 100}>
          <View style={styles.ringInner}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{data.totalScore}</Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <Text style={styles.gradeLabel}>GRADE {data.gradeLabel}</Text>
          </View>
        </ScoreRing>
      </View>

      {/* Breakdown */}
      <View style={styles.breakdown}>
        {data.categories.map((c) => (
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
            <Text style={styles.feedbackInitials}>{data.feedbackInitials}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.feedbackAuthor}>{data.feedbackAuthor}</Text>
            <Text style={styles.feedbackRole}>Coaching feedback</Text>
          </View>
        </View>
        <Text style={styles.feedbackQuote}>“{data.feedbackText}”</Text>
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
