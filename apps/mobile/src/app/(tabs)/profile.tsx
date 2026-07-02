import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { Icon, Screen, SubmissionCard } from '@/components';
import { PROFILE, SUBMISSIONS } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';
import type { ProgressPoint } from '@/types';

export default function ProfileScreen() {
  return (
    <Screen>
      {/* Identity */}
      <View style={styles.identity}>
        <LinearGradient
          colors={Colors.avatarGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}>
          <Text style={styles.avatarText}>{PROFILE.initials}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{PROFILE.name}</Text>
          <Text style={styles.meta}>
            {PROFILE.level} · {PROFILE.joined}
          </Text>
        </View>
        <Icon name="settings" size={22} color={Colors.textMuted} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard value={PROFILE.dayStreak} label="Day streak" highlight />
        <StatCard value={PROFILE.studiesDone} label="Studies done" />
        <StatCard value={PROFILE.avgScore} label="Avg score" />
      </View>

      {/* Progress chart */}
      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartTitle}>Score progress</Text>
          <Text style={styles.chartTrend}>▲ 18 pts · 8 weeks</Text>
        </View>
        <ProgressChart points={PROFILE.progress} />
        <View style={styles.axis}>
          {PROFILE.progress
            .filter((p) => p.label !== '')
            .map((p) => (
              <Text key={p.label} style={styles.axisLabel}>
                {p.label}
              </Text>
            ))}
        </View>
      </View>

      {/* Recent recordings */}
      <View>
        <View style={styles.recentHead}>
          <Text style={styles.recentLabel}>RECENT RECORDINGS</Text>
          <Text style={styles.seeAll}>See all</Text>
        </View>
        <View style={styles.recentList}>
          {SUBMISSIONS.map((s) => (
            <SubmissionCard key={s.id} submission={s} onPress={() => router.push('/results')} />
          ))}
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

/** Area chart of the score trend — mirrors the design's inline SVG line+fill. */
function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const W = 300;
  const top = 16;
  const bottom = 104;
  const left = 10;
  const right = 290;
  const domainMin = 66;
  const domainMax = 92;

  const n = points.length;
  const x = (i: number) => left + (i * (right - left)) / (n - 1);
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
      <Path d={area} fill="url(#cc-area)" />
      <Path
        d={line}
        fill="none"
        stroke={Colors.gold}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  chartTitle: { fontFamily: Fonts.sansSemibold, fontSize: 13, color: Colors.textCream },
  chartTrend: { fontFamily: Fonts.sansSemibold, fontSize: 11.5, color: Colors.good },
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
