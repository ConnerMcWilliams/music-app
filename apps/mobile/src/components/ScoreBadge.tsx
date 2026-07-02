import { Text } from 'react-native';

import { Colors, Fonts } from '@/theme';

interface ScoreBadgeProps {
  /** Score 0–100. */
  score: number;
  /** Font size of the number (defaults to 20). */
  size?: number;
}

/**
 * Displays a graded score as a serif numeral. Scores of 90+ are highlighted in
 * green, everything else in gold — matching the design's color coding.
 */
export function ScoreBadge({ score, size = 20 }: ScoreBadgeProps) {
  const color = score >= 90 ? Colors.good : Colors.gold;
  return (
    <Text
      style={{
        fontFamily: Fonts.serifBold,
        fontSize: size,
        lineHeight: size,
        color,
      }}>
      {score}
    </Text>
  );
}
