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
  SubmissionCard,
} from '@/components';
import { useProfile } from '@/hooks/useProfile';
import { useSubmissions } from '@/hooks/useSubmissions';
import { buildScoreTrend, type TrendGranularity } from '@/lib/scoreTrend';
import { setLastGradingResult } from '@/services/lastGradingResult';
import { Colors, Fonts, Radius } from '@/theme';
import type { ProgressPoint, Submission } from '@/types';

export default function ProfileScreen() {
  const profile = useProfile();
  const submissions = useSubmissions();
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const trend = useMemo(
    () => buildScoreTrend(submissions.data, granularity),
    [submissions.data, granularity],
  );
  const hasTrend = trend.points.length >= 2;

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
              return (
                <Pressable
                  key={g}
                  onPress={() => setGranularity(g)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.toggleBtn, active && styles.toggleBtnActive]}>
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
          <Text style={styles.seeAll}>See all</Text>
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
