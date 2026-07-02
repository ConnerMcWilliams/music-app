import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Exercise } from '@/types';
import { Colors, Fonts, Radius } from '@/theme';
import { Icon } from './Icon';
import { ScoreBadge } from './ScoreBadge';

interface ExerciseCardProps {
  exercise: Exercise;
  onPress?: (exercise: Exercise) => void;
}

/**
 * List row for a Clarke study. Renders three visual states from the mockup:
 * completed (shows score), in-progress (today's highlighted card), and locked.
 */
export function ExerciseCard({ exercise, onPress }: ExerciseCardProps) {
  const { status } = exercise;
  const isActive = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';

  const subtitle = isActive ? "Today's practice · in progress" : exercise.subtitle;

  const inner = (
    <>
      <NumberBadge number={exercise.number} status={status} />
      <View style={styles.body}>
        <Text style={[styles.title, isLocked && styles.titleLocked]}>{exercise.title}</Text>
        <Text style={[styles.subtitle, isActive && styles.subtitleActive]}>{subtitle}</Text>
      </View>
      {isCompleted && exercise.score != null && (
        <View style={styles.trailing}>
          <ScoreBadge score={exercise.score} size={20} />
          <Text style={styles.trailingLabel}>Completed</Text>
        </View>
      )}
      {isActive && <Icon name="chevron-right" size={22} color={Colors.gold} strokeWidth={1.8} />}
      {isLocked && <Icon name="lock" size={18} color={Colors.textMutedDim} />}
    </>
  );

  const content = isActive ? (
    <LinearGradient
      colors={Colors.activeCardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, styles.cardActive]}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[styles.card, isCompleted ? styles.cardCompleted : styles.cardLocked]}>{inner}</View>
  );

  if (!onPress || isLocked) {
    return content;
  }

  return (
    <Pressable
      onPress={() => onPress(exercise)}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

function NumberBadge({ number, status }: { number: number; status: Exercise['status'] }) {
  if (status === 'in_progress') {
    return (
      <LinearGradient
        colors={Colors.goldGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}>
        <Text style={[styles.badgeText, { color: Colors.textOnCream }]}>{number}</Text>
      </LinearGradient>
    );
  }
  const isCompleted = status === 'completed';
  return (
    <View
      style={[
        styles.badge,
        isCompleted ? styles.badgeCompleted : styles.badgeLocked,
      ]}>
      <Text
        style={[styles.badgeText, { color: isCompleted ? Colors.gold : Colors.textMutedDim }]}>
        {number}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  cardCompleted: {
    backgroundColor: Colors.surface,
    borderColor: Colors.mutedBorder,
  },
  cardActive: {
    borderWidth: 1.4,
    borderColor: Colors.goldBorderStrong,
    shadowColor: Colors.goldDeep,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cardLocked: {
    backgroundColor: 'transparent',
    borderColor: Colors.mutedBorderSoft,
    opacity: 0.62,
  },
  pressed: { opacity: 0.85 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompleted: {
    backgroundColor: 'rgba(228,197,126,.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,.3)',
  },
  badgeLocked: {
    backgroundColor: 'rgba(126,147,172,.08)',
  },
  badgeText: {
    fontFamily: Fonts.serifBold,
    fontSize: 21,
  },
  body: { flex: 1 },
  title: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15,
    color: Colors.textCream,
  },
  titleLocked: { color: Colors.lockedText },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  subtitleActive: {
    fontFamily: Fonts.sansSemibold,
    color: Colors.goldDeep,
  },
  trailing: { alignItems: 'flex-end' },
  trailingLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
