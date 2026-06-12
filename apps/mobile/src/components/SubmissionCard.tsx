import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Submission } from '@/types';
import { Colors, Fonts, Radius } from '@/theme';
import { Icon } from './Icon';
import { ScoreBadge } from './ScoreBadge';

interface SubmissionCardProps {
  submission: Submission;
  onPress?: (submission: Submission) => void;
}

/**
 * Compact row for a past practice recording (used in the profile "Recent
 * recordings" list): play glyph, title, date · duration, and the graded score.
 */
export function SubmissionCard({ submission, onPress }: SubmissionCardProps) {
  return (
    <Pressable
      onPress={onPress ? () => onPress(submission) : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress ? styles.pressed : null]}>
      <View style={styles.iconTile}>
        <Icon name="play" size={16} color={Colors.gold} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{submission.title}</Text>
        <Text style={styles.meta}>
          {submission.dateLabel} · {submission.durationLabel}
        </Text>
      </View>
      <ScoreBadge score={submission.score} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(126,147,172,.11)',
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  pressed: { opacity: 0.85 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(228,197,126,.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 13.5,
    color: Colors.textCream,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
