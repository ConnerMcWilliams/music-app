import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Colors } from '@/theme';

/**
 * Inline SVG icon set. Paths are taken verbatim from the Claude Design handoff so
 * the icons match the mockup exactly. Using react-native-svg (already required for
 * the score rings, sheet music, and chart) avoids pulling in an icon font dep.
 */
export type IconName =
  | 'home'
  | 'search'
  | 'mic'
  | 'award'
  | 'user'
  | 'chevron-right'
  | 'chevron-left'
  | 'lock'
  | 'play'
  | 'flame'
  | 'logo'
  | 'metronome'
  | 'mic-large'
  | 'upload'
  | 'headphones'
  | 'settings';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = Colors.textCream, strokeWidth = 1.7 }: IconProps) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 11l8-7 8 7" {...stroke} />
          <Path d="M6 10v9h12v-9" {...stroke} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="11" cy="11" r="6.5" {...stroke} />
          <Path d="M16 16l4 4" {...stroke} />
        </Svg>
      );
    case 'mic':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="9" y="3" width="6" height="11" rx="3" {...stroke} />
          <Path d="M6 11a6 6 0 0012 0" {...stroke} />
          <Path d="M12 17v3" {...stroke} />
        </Svg>
      );
    case 'award':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="9" r="5" {...stroke} />
          <Path d="M9 13.5L7.5 21l4.5-2.6L16.5 21 15 13.5" {...stroke} />
        </Svg>
      );
    case 'user':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="8" r="4" {...stroke} />
          <Path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" {...stroke} />
        </Svg>
      );
    case 'chevron-right':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 6l6 6-6 6" {...stroke} strokeWidth={strokeWidth ?? 1.8} />
        </Svg>
      );
    case 'chevron-left':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M15 6l-6 6 6 6" {...stroke} strokeWidth={strokeWidth ?? 1.8} />
        </Svg>
      );
    case 'lock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="5" y="11" width="14" height="9" rx="2" {...stroke} />
          <Path d="M8 11V8a4 4 0 018 0v3" {...stroke} />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M8 5v14l11-7z" fill={color} />
        </Svg>
      );
    case 'flame':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 3c1 3.5-1.5 4.5-1.5 7A1.5 1.5 0 0012 11.5 1.5 1.5 0 0013.5 10c1.5 1 2.5 2.8 2.5 4.5a4 4 0 11-8 0c0-3 2-5 4-11.5z"
            {...stroke}
            strokeWidth={1.6}
          />
        </Svg>
      );
    case 'logo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 12h3l2-3 3 6 2-4h8" {...stroke} strokeWidth={1.8} />
          <Circle cx="20" cy="12" r="1.4" fill={color} />
        </Svg>
      );
    case 'metronome':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 3h6l3 17H6z" {...stroke} />
          <Path d="M12 7v9" {...stroke} />
          <Path d="M12 16l3-7" {...stroke} />
        </Svg>
      );
    case 'mic-large':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="9" y="3" width="6" height="11" rx="3" fill={color} />
          <Path d="M6 11a6 6 0 0012 0" {...stroke} strokeWidth={1.9} />
          <Path d="M12 17v4" {...stroke} strokeWidth={1.9} />
        </Svg>
      );
    case 'upload':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 16V5" {...stroke} strokeWidth={1.6} />
          <Path d="M8 9l4-4 4 4" {...stroke} strokeWidth={1.6} />
          <Path d="M5 19h14" {...stroke} strokeWidth={1.6} />
        </Svg>
      );
    case 'headphones':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 14a8 8 0 0116 0" {...stroke} strokeWidth={1.6} />
          <Rect x="3" y="14" width="4" height="6" rx="1.6" {...stroke} strokeWidth={1.6} />
          <Rect x="17" y="14" width="4" height="6" rx="1.6" {...stroke} strokeWidth={1.6} />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="3" {...stroke} />
          <Path
            d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z"
            {...stroke}
          />
        </Svg>
      );
    default:
      return <Line />;
  }
}
