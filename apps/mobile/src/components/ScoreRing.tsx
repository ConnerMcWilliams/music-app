import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Colors } from '@/theme';

interface ScoreRingProps {
  size: number;
  strokeWidth: number;
  /** Fraction filled, 0–1. */
  progress: number;
  children?: ReactNode;
  trackColor?: string;
}

/**
 * Circular progress ring with a gold gradient stroke. Approximates the design's
 * conic-gradient rings (streak ring, results score ring) with an SVG arc, and
 * centers any `children` (e.g. the score number) inside.
 */
export function ScoreRing({
  size,
  strokeWidth,
  progress,
  children,
  trackColor = Colors.ringTrack,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);
  // Unique, stable per-instance id (colons stripped so the SVG url() ref is valid on web).
  const gradientId = `score-ring-${useId().replace(/:/g, '')}`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={Colors.gold} />
            <Stop offset="1" stopColor={Colors.goldDeep} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children != null && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
