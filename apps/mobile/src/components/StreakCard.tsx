import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius } from '@/theme';
import { Icon } from './Icon';
import { ScoreRing } from './ScoreRing';

interface StreakCardProps {
  days: number;
  personalBest: number;
}

/**
 * Daily-streak summary card with a progress ring (current streak vs. personal
 * best) and a flame accent, as on the Today screen.
 */
export function StreakCard({ days, personalBest }: StreakCardProps) {
  const progress = personalBest > 0 ? days / personalBest : 0;

  return (
    <LinearGradient
      colors={Colors.streakGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}>
      <ScoreRing size={62} strokeWidth={6} progress={progress}>
        <View style={styles.ringCenter}>
          <Text style={styles.ringNumber}>{days}</Text>
        </View>
      </ScoreRing>

      <View style={styles.body}>
        <Text style={styles.title}>Day streak</Text>
        <Text style={styles.subtitle}>Personal best · {personalBest} days</Text>
      </View>

      <Icon name="flame" size={20} color={Colors.gold} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    paddingVertical: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  ringCenter: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.ringCenter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    lineHeight: 26,
    color: Colors.gold,
  },
  body: { flex: 1 },
  title: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15,
    color: Colors.textCream,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Colors.textMuted,
    marginTop: 3,
  },
});
