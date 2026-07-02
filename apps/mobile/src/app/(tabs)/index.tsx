import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen, StreakCard } from '@/components';
import { getTodayExercise, PROFILE } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';

// Static "today" label to match the mockup; a real build would derive this.
const TODAY_LABEL = 'Tuesday, June 11';
const WEEK = [
  { day: 'M', state: 'done' },
  { day: 'T', state: 'done' },
  { day: 'W', state: 'current' },
  { day: 'T', state: 'todo' },
  { day: 'F', state: 'todo' },
  { day: 'S', state: 'todo' },
  { day: 'S', state: 'todo' },
] as const;

export default function TodayScreen() {
  const exercise = getTodayExercise();
  const firstName = PROFILE.name.split(' ')[0];

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{TODAY_LABEL}</Text>
          <Text style={styles.greeting}>Good morning, {firstName}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{PROFILE.initials}</Text>
        </View>
      </View>

      <StreakCard days={PROFILE.dayStreak} personalBest={PROFILE.personalBest} />

      {/* Hero — today's study */}
      <View style={styles.hero}>
        <LinearGradient
          colors={Colors.goldGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.heroAccent}
        />
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>TODAY&apos;S STUDY</Text>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>≈ {exercise.estMinutes} min</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Clarke Study No. {exercise.number}</Text>
        <Text style={styles.heroSubtitle}>First Studies · {exercise.subtitle}</Text>

        <View style={styles.heroDivider} />

        <View style={styles.statRow}>
          <Stat label="KEY" value={exercise.key} />
          <View style={styles.statDivider} />
          <Stat label="TEMPO" value={exercise.tempo} />
          <View style={styles.statDivider} />
          <Stat label="RANGE" value={exercise.rangeLabel} />
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/practice', params: { exerciseId: exercise.id } })}
          style={({ pressed }) => pressed && styles.pressed}>
          <LinearGradient
            colors={Colors.darkButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.beginButton}>
            <Icon name="play" size={18} color={Colors.gold} />
            <Text style={styles.beginText}>Begin Practice</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* This week strip */}
      <View>
        <Text style={styles.weekLabel}>THIS WEEK</Text>
        <View style={styles.weekRow}>
          {WEEK.map((d, i) => (
            <DayPill key={i} day={d.day} state={d.state} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DayPill({ day, state }: { day: string; state: 'done' | 'current' | 'todo' }) {
  if (state === 'done') {
    return (
      <LinearGradient
        colors={Colors.goldGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dayPill}>
        <Text style={[styles.dayText, { color: Colors.textOnCream }]}>{day}</Text>
      </LinearGradient>
    );
  }
  const current = state === 'current';
  return (
    <View
      style={[
        styles.dayPill,
        styles.dayPillOutline,
        { borderColor: current ? Colors.gold : 'rgba(126,147,172,.3)' },
        current && { backgroundColor: 'rgba(228,197,126,.08)' },
      ]}>
      <Text style={[styles.dayText, { color: current ? Colors.gold : Colors.textMutedDark }]}>
        {day}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted },
  greeting: {
    fontFamily: Fonts.serif,
    fontSize: 25,
    color: Colors.textCream,
    marginTop: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.goldBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.gold },

  hero: {
    backgroundColor: Colors.heroGradient[0],
    borderRadius: Radius.xxl,
    padding: 22,
    paddingBottom: 24,
    overflow: 'hidden',
    shadowColor: '#080F1C',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
    elevation: 6,
  },
  heroAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroEyebrow: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2,
    color: Colors.goldLabel,
  },
  heroChip: {
    backgroundColor: 'rgba(27,47,73,.07)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  heroChipText: { fontFamily: Fonts.sansSemibold, fontSize: 11.5, color: '#5A6472' },
  heroTitle: { fontFamily: Fonts.serifBold, fontSize: 31, color: Colors.textOnCream },
  heroSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    color: Colors.textOnCreamMuted,
    marginTop: 5,
  },
  heroDivider: { height: 1, backgroundColor: Colors.hairlineOnCream, marginVertical: 15 },
  statRow: { flexDirection: 'row', gap: 18, marginBottom: 18, alignItems: 'center' },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.hairlineOnCream },
  statLabel: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 10.5,
    letterSpacing: 1,
    color: Colors.goldMuted,
  },
  statValue: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 14,
    color: Colors.textInkSoft,
    marginTop: 2,
  },
  beginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
  },
  beginText: { fontFamily: Fonts.sansSemibold, fontSize: 15.5, color: Colors.textCream },
  pressed: { opacity: 0.85 },

  weekLabel: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 12,
    letterSpacing: 1,
    color: Colors.textMuted,
    marginBottom: 11,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayPill: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillOutline: { borderWidth: 1.5 },
  dayText: { fontFamily: Fonts.sansBold, fontSize: 13 },
});
