import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  ScoreRing,
  SubmissionCard,
} from '@/components';
import { useProfile } from '@/hooks/useProfile';
import { useSubmissions } from '@/hooks/useSubmissions';
import { buildScoreTrend, type TrendGranularity } from '@/lib/scoreTrend';
import { setLastGradingResult } from '@/services/lastGradingResult';
import { purchaseStreakFreeze } from '@/services/profile';
import { Colors, Fonts, Radius } from '@/theme';
import type { ProgressPoint, Submission, UserProfile } from '@/types';

export default function ProfileScreen() {
  const profile = useProfile();
  const submissions = useSubmissions();
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [buyingFreeze, setBuyingFreeze] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  const buyFreeze = async () => {
    setBuyingFreeze(true);
    setFreezeError(null);
    try {
      await purchaseStreakFreeze();
      profile.reloadStats(); // refresh coins + freeze count in place
    } catch (err) {
      setFreezeError(err instanceof Error ? err.message : 'Purchase failed.');
    } finally {
      setBuyingFreeze(false);
    }
  };
  const trend = useMemo(
    () => buildScoreTrend(submissions.data, granularity),
    [submissions.data, granularity],
  );
  const hasTrend = trend.points.length >= 2;
  // Whether Week granularity would yield a real chart — checked without switching
  // the active view so tapping Week can't strand the user on the empty state.
  const weekAvailable = useMemo(
    () => buildScoreTrend(submissions.data, 'week').points.length >= 2,
    [submissions.data],
  );

  const openSubmission = (s: Submission) => {
    // Hand the tapped take's stored grade to the Results screen (it prefers this
    // over the mock) so it renders that submission and can replay the recording.
    setLastGradingResult(s.grade);
    router.push('/results');
  };

  return (
    <Screen>
      {/* Identity */}
      <View style={styles.identity}>
        <LinearGradient
          colors={Colors.avatarGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.initials}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.meta}>{profile.joined}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/account')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Account settings">
          <Icon name="settings" size={22} color={Colors.textMuted} />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard value={profile.dayStreak} label="Day streak" highlight />
        <StatCard value={profile.studiesDone} label="Studies done" />
        <StatCard value={profile.avgScore} label="Avg score" />
      </View>

      {/* Level & rewards */}
      <LevelCard
        profile={profile}
        onBuyFreeze={buyFreeze}
        buying={buyingFreeze}
        error={freezeError}
      />

      {/* Progress chart */}
      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <View style={styles.chartHeadText}>
            <Text style={styles.chartTitle}>Score progress</Text>
            {hasTrend && (
              <Text
                style={[
                  styles.chartTrend,
                  { color: trend.deltaPoints >= 0 ? Colors.good : Colors.textMuted },
                ]}>
                {trend.deltaPoints >= 0 ? '▲' : '▼'} {Math.abs(trend.deltaPoints)} pts ·{' '}
                {trend.spanLabel}
              </Text>
            )}
          </View>
          <View style={styles.toggle}>
            {(['day', 'week'] as const).map((g) => {
              const active = granularity === g;
              const disabled = g === 'week' && !weekAvailable;
              return (
                <Pressable
                  key={g}
                  onPress={disabled ? undefined : () => setGranularity(g)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled }}
                  style={[
                    styles.toggleBtn,
                    active && styles.toggleBtnActive,
                    disabled && styles.toggleBtnDisabled,
                  ]}>
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {g === 'day' ? 'Day' : 'Week'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {submissions.loading ? (
          <LoadingState message="Loading your progress…" />
        ) : submissions.error ? (
          <ErrorState message="We couldn’t load your progress." onRetry={submissions.refetch} />
        ) : !hasTrend ? (
          <EmptyState
            title="Not enough data yet"
            message="Record a couple of studies to see your score trend."
          />
        ) : (
          <>
            <ProgressChart points={trend.points} />
            <View style={styles.axis}>
              {trend.points
                .filter((p) => p.label !== '')
                .map((p, i) => (
                  <Text key={`${p.label}-${i}`} style={styles.axisLabel}>
                    {p.label}
                  </Text>
                ))}
            </View>
          </>
        )}
      </View>

      {/* Recent recordings */}
      <View>
        <View style={styles.recentHead}>
          <Text style={styles.recentLabel}>RECENT RECORDINGS</Text>
          <Pressable
            onPress={() => router.push('/recordings')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="See all recordings">
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.recentList}>
          {submissions.loading ? (
            <LoadingState message="Loading your recordings…" />
          ) : submissions.error ? (
            <ErrorState
              message="We couldn’t load your recordings."
              onRetry={submissions.refetch}
            />
          ) : submissions.data.length === 0 ? (
            <EmptyState
              title="No recordings yet"
              message="Record a study and your graded takes show up here."
            />
          ) : (
            submissions.data.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                onPress={s.grade ? openSubmission : undefined}
              />
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

function StatCard({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: highlight ? Colors.gold : Colors.textCream }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Level, rank, and the reward economy: an XP progress ring toward the next
 * level, the coin balance, and the streak-freeze count with a "buy" action.
 * Reuses the gold {@link ScoreRing} (as a level ring) and the app's gold accent.
 */
function LevelCard({
  profile,
  onBuyFreeze,
  buying,
  error,
}: {
  profile: UserProfile;
  onBuyFreeze: () => void;
  buying: boolean;
  error: string | null;
}) {
  const ringProgress =
    profile.xpForNextLevel > 0 ? profile.xpIntoLevel / profile.xpForNextLevel : 0;
  const atCap = profile.streakFreezes >= profile.maxFreezes;
  const tooPoor = profile.coins < profile.freezeCost;
  const canBuy = profile.freezeCost > 0 && !atCap && !tooPoor && !buying;
  const buyHint = atCap ? 'Full' : `${profile.freezeCost} coins`;

  return (
    <View style={styles.levelCard}>
      <View style={styles.levelTop}>
        <ScoreRing size={68} strokeWidth={7} progress={ringProgress}>
          <View style={styles.levelRingInner}>
            <Text style={styles.levelRingNum}>{profile.level}</Text>
            <Text style={styles.levelRingLabel}>LVL</Text>
          </View>
        </ScoreRing>
        <View style={styles.levelInfo}>
          <Text style={styles.rankTitle}>{profile.rankTitle}</Text>
          <Text style={styles.levelXp}>
            {profile.xpForNextLevel > 0
              ? `${profile.xpIntoLevel} / ${profile.xpForNextLevel} XP to level ${profile.level + 1}`
              : `${profile.xp} XP`}
          </Text>
          <View style={styles.rewardPills}>
            <View style={styles.rewardPill}>
              <Text style={styles.rewardValue}>{profile.coins}</Text>
              <Text style={styles.rewardLabel}>coins</Text>
            </View>
            <View style={styles.rewardPill}>
              <Text style={styles.rewardValue}>
                {profile.streakFreezes}/{profile.maxFreezes}
              </Text>
              <Text style={styles.rewardLabel}>freezes</Text>
            </View>
          </View>
        </View>
      </View>

      <Pressable
        onPress={canBuy ? onBuyFreeze : undefined}
        disabled={!canBuy}
        accessibilityRole="button"
        accessibilityLabel="Buy a streak freeze"
        accessibilityState={{ disabled: !canBuy }}
        style={({ pressed }) => [
          styles.freezeBtn,
          !canBuy && styles.freezeBtnDisabled,
          pressed && styles.pressed,
        ]}>
        <Icon name="flame" size={15} color={canBuy ? Colors.gold : Colors.textMuted} />
        <Text style={[styles.freezeBtnText, !canBuy && styles.freezeBtnTextDisabled]}>
          {buying ? 'Buying…' : `Buy streak freeze · ${buyHint}`}
        </Text>
      </Pressable>
      {error ? <Text style={styles.freezeError}>{error}</Text> : null}
    </View>
  );
}

/**
 * Area chart of the score trend — mirrors the design's inline SVG line+fill.
 * The y-domain adapts to the data (padded, clamped 0–100) so real scores aren't
 * clipped, and a single point renders just its marker.
 */
function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const W = 300;
  const top = 16;
  const bottom = 104;
  const left = 10;
  const right = 290;

  const n = points.length;
  const values = points.map((p) => p.value);
  let domainMin = Math.max(0, Math.floor(Math.min(...values) - 6));
  let domainMax = Math.min(100, Math.ceil(Math.max(...values) + 6));
  if (domainMin >= domainMax) {
    // Flat series — give the line a little vertical room so it isn't glued to an edge.
    domainMin = Math.max(0, domainMin - 5);
    domainMax = Math.min(100, domainMax + 5);
  }

  const x = (i: number) => (n > 1 ? left + (i * (right - left)) / (n - 1) : (left + right) / 2);
  const y = (v: number) => {
    const t = (Math.max(domainMin, Math.min(domainMax, v)) - domainMin) / (domainMax - domainMin);
    return bottom - t * (bottom - top);
  };

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(n - 1)},${bottom} L${x(0)},${bottom} Z`;
  const last = points[n - 1];

  return (
    <Svg width="100%" height={116} viewBox={`0 0 ${W} 116`}>
      <Defs>
        <SvgGradient id="cc-area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.goldDeep} stopOpacity={0.34} />
          <Stop offset="1" stopColor={Colors.goldDeep} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <G stroke="rgba(126,147,172,.14)" strokeWidth={1}>
        {[31, 65, 99].map((gy) => (
          <Line key={gy} x1={0} y1={gy} x2={W} y2={gy} />
        ))}
      </G>
      {n > 1 && <Path d={area} fill="url(#cc-area)" />}
      {n > 1 && (
        <Path
          d={line}
          fill="none"
          stroke={Colors.gold}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <Circle cx={x(n - 1)} cy={y(last.value)} r={4.5} fill={Colors.gold} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.serif, fontSize: 25, color: Colors.gold },
  name: { fontFamily: Fonts.serif, fontSize: 26, color: Colors.textCream },
  meta: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted, marginTop: 3 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statValue: { fontFamily: Fonts.serifBold, fontSize: 26, lineHeight: 28 },
  statLabel: { fontFamily: Fonts.sans, fontSize: 10.5, color: Colors.textMuted, marginTop: 5 },

  levelCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.goldBorderSoft,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 14,
  },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  levelRingInner: { alignItems: 'center', justifyContent: 'center' },
  levelRingNum: {
    fontFamily: Fonts.serifBold,
    fontSize: 22,
    lineHeight: 24,
    color: Colors.textCream,
  },
  levelRingLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 8,
    letterSpacing: 1.2,
    color: Colors.gold,
    marginTop: 1,
  },
  levelInfo: { flex: 1, gap: 4 },
  rankTitle: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.textCream },
  levelXp: { fontFamily: Fonts.sans, fontSize: 11.5, color: Colors.textMuted },
  rewardPills: { flexDirection: 'row', gap: 8, marginTop: 3 },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  rewardValue: { fontFamily: Fonts.serifBold, fontSize: 13, color: Colors.gold },
  rewardLabel: { fontFamily: Fonts.sans, fontSize: 10.5, color: Colors.textMuted },
  freezeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.goldBorderStrong,
  },
  freezeBtnDisabled: { borderColor: Colors.mutedBorder },
  freezeBtnText: { fontFamily: Fonts.sansSemibold, fontSize: 13, color: Colors.gold },
  freezeBtnTextDisabled: { color: Colors.textMuted },
  freezeError: { fontFamily: Fonts.sans, fontSize: 11.5, color: '#D98A8A', textAlign: 'center' },
  pressed: { opacity: 0.85 },

  chartCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartHeadText: { flex: 1, gap: 3 },
  chartTitle: { fontFamily: Fonts.sansSemibold, fontSize: 13, color: Colors.textCream },
  chartTrend: { fontFamily: Fonts.sansSemibold, fontSize: 11.5, color: Colors.good },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: 2,
    gap: 2,
  },
  toggleBtn: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: Radius.sm - 3 },
  toggleBtnActive: { backgroundColor: Colors.goldBorderSoft },
  toggleBtnDisabled: { opacity: 0.4 },
  toggleText: { fontFamily: Fonts.sansSemibold, fontSize: 11, color: Colors.textMuted },
  toggleTextActive: { color: Colors.gold },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.textMutedDim },

  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  recentLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  seeAll: { fontFamily: Fonts.sansSemibold, fontSize: 11.5, color: Colors.goldDeep },
  recentList: { gap: 9 },
});
