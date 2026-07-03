import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path } from 'react-native-svg';

import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise } from '@/types';

/**
 * The study's music view — the cream "paper" sheet-music surface.
 *
 * Extracted verbatim from the original recording screen so Practice and Record
 * render the *same* view at the same size, spacing, scaling, and styling. It is
 * the single source of truth for how a study's sheet music looks; neither screen
 * duplicates the rendering.
 *
 * States handled (same footprint in every case, so layout never shifts):
 *  - `loading`  → placeholder while the study is being fetched
 *  - invalid    → no/unknown exercise
 *  - ready      → the study's staff + phrase
 *
 * The staff is generated vector art (from the design handoff), not a bitmap, so
 * there is no separate image URL to load; "missing image" maps to "invalid
 * study" here. When real notation images arrive, swap `<SheetMusic/>` for an
 * `<Image/>` with its own load/error handling — the surface and states stay.
 */
interface MusicViewProps {
  exercise?: Exercise;
  loading?: boolean;
}

/** Fixed height for the notation area so all three states share one footprint. */
const STAFF_HEIGHT = 84;

export function MusicView({ exercise, loading = false }: MusicViewProps) {
  if (loading) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading study…</Text>
        </View>
      </Surface>
    );
  }

  if (!exercise) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Study unavailable</Text>
          <Text style={styles.placeholderText}>
            We couldn’t find this study’s sheet music.
          </Text>
        </View>
      </Surface>
    );
  }

  return (
    <Surface>
      <View style={styles.sheetTop}>
        <Text style={styles.sheetLabel}>FIRST STUDIES · No. {exercise.number}</Text>
        <Text style={styles.sheetKey}>{exercise.key}</Text>
      </View>
      <SheetMusic />
    </Surface>
  );
}

/** Cream card that wraps the notation in every state. */
function Surface({ children }: { children: React.ReactNode }) {
  return <View style={styles.sheet}>{children}</View>;
}

/** Decorative staff with a slurred phrase — mirrors the design's inline SVG. */
function SheetMusic() {
  const heads = [
    [58, 62],
    [82, 56],
    [106, 50],
    [130, 44],
    [170, 38],
    [194, 44],
    [218, 50],
    [242, 56],
  ];
  return (
    <Svg width="100%" height={STAFF_HEIGHT} viewBox="0 0 300 84">
      <G stroke="#3A4658" strokeWidth={1} opacity={0.7}>
        {[20, 32, 44, 56, 68].map((y) => (
          <Line key={y} x1={6} y1={y} x2={294} y2={y} />
        ))}
      </G>
      <Path
        d="M22 70c0-10 4-16 4-26 0-7-7-9-7-3 0 5 6 6 8 1 3-8-2-16-5-16"
        stroke={Colors.textInk}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <Line x1={150} y1={14} x2={150} y2={74} stroke="#3A4658" strokeWidth={1} opacity={0.5} />
      <Line x1={294} y1={14} x2={294} y2={74} stroke="#3A4658" strokeWidth={1.4} opacity={0.7} />
      <G fill={Colors.textInk}>
        {heads.map(([cx, cy], i) => (
          <Ellipse key={i} cx={cx} cy={cy} rx={5.2} ry={3.8} transform={`rotate(-20 ${cx} ${cy})`} />
        ))}
      </G>
      <G stroke={Colors.textInk} strokeWidth={1.3}>
        {heads.map(([cx, cy], i) => (
          <Line key={i} x1={cx + 4.5} y1={cy - 1} x2={cx + 4.5} y2={cy - 22} />
        ))}
      </G>
      <Path d="M58 70q36 14 72 0" stroke={Colors.goldDeep} strokeWidth={1.6} fill="none" />
      <Path d="M170 70q36 14 72 0" stroke={Colors.goldDeep} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.creamGradient[0],
    borderRadius: Radius.xl,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#080F1C',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  sheetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: Colors.goldLabel,
  },
  sheetKey: { fontFamily: Fonts.sansSemibold, fontSize: 11, color: '#5A6472' },

  placeholder: {
    height: STAFF_HEIGHT + 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderTitle: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 14,
    color: Colors.textOnCream,
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Colors.textOnCreamMuted,
    textAlign: 'center',
  },
});
