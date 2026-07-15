import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  BEAM_THICKNESS,
  BOTTOM_LINE,
  END_BAR_X,
  LINE_WIDTH,
  MIDDLE_LINE,
  STAFF_LINES,
  STEM_OFFSET_X,
  TOP_LINE,
  layoutScore,
  parseMusicXML,
  type PlacedNote,
  type SystemLayout,
} from '@/lib/musicxml';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise } from '@/types';

/**
 * MusicXmlView — the study's music view, rendered from **MusicXML**.
 *
 * This is the notation surface for Practice and Record: it parses the study's
 * `StudyContent.musicxml` (bundled today as `@/data` → `MUSICXML_BY_ID`) and
 * draws it on a cream "paper" Surface with a header row.
 *
 * Layout is computed by `@/lib/musicxml`'s `layoutScore` (pure and
 * unit-tested): measures pack onto staff lines by their engraved width (dense
 * bars get a line to themselves), systems chunk into pages behind the
 * page-flip controls, and every system carries its own vertical bounds so
 * ledger-line notes are never clipped — the SVG viewBox tracks the content.
 *
 * Rendering is intentionally a faithful subset (note-heads, stems, flags,
 * beams, accidentals, ledger lines, bar lines, slurs). It uses
 * `react-native-svg` only — no WebView, no native module, works on web too.
 * See `docs/architecture.md` → "Notation rendering (MusicXML)".
 */
interface MusicXmlViewProps {
  exercise?: Exercise;
  /** Canonical MusicXML for the study (from `StudyContent.musicxml`). */
  musicXml?: string;
  loading?: boolean;
}

/** Fixed notation-area height for the loading/unavailable states (one system). */
const STAFF_HEIGHT = 84;

export function MusicXmlView({ exercise, musicXml, loading = false }: MusicXmlViewProps) {
  const score = useMemo(() => (musicXml ? parseMusicXML(musicXml) : undefined), [musicXml]);
  const pages = useMemo(() => layoutScore(score), [score]);

  // Page through the study, resetting to the first page whenever the study
  // changes. Adjusting state during render (vs. an effect) keeps the reset in the
  // same commit as the new study, so no stale page flashes.
  const [page, setPage] = useState(0);
  const [shownXml, setShownXml] = useState(musicXml);
  if (musicXml !== shownXml) {
    setShownXml(musicXml);
    setPage(0);
  }

  if (loading) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading study…</Text>
        </View>
      </Surface>
    );
  }

  if (!exercise || !score || pages.length === 0) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Notation unavailable</Text>
          <Text style={styles.placeholderText}>
            This study doesn’t have MusicXML notation yet.
          </Text>
        </View>
      </Surface>
    );
  }

  const currentPage = Math.min(page, pages.length - 1);
  const systems = pages[currentPage];

  return (
    <Surface>
      <View style={styles.sheetTop}>
        <Text style={styles.sheetLabel}>FIRST STUDIES · No. {exercise.number}</Text>
        <Text style={styles.sheetKey}>{exercise.key}</Text>
      </View>

      <View style={styles.systems}>
        {systems.map((system, i) => (
          <SystemStaff key={i} system={system} />
        ))}
      </View>

      {pages.length > 1 && (
        <PageControls
          page={currentPage}
          total={pages.length}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
        />
      )}
    </Surface>
  );
}

/** Cream card that wraps the notation in every state (mirrors MusicView). */
function Surface({ children }: { children: React.ReactNode }) {
  return <View style={styles.sheet}>{children}</View>;
}

/** Prev / next page flipper, shown only for multi-page studies. */
function PageControls({
  page,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const atStart = page === 0;
  const atEnd = page === total - 1;
  return (
    <View style={styles.pager}>
      <PagerButton label="‹ Prev" onPress={onPrev} disabled={atStart} />
      <Text style={styles.pagerLabel}>
        Page {page + 1} of {total}
      </Text>
      <PagerButton label="Next ›" onPress={onNext} disabled={atEnd} />
    </View>
  );
}

function PagerButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pagerBtn,
        pressed && !disabled && styles.pagerBtnPressed,
        disabled && styles.pagerBtnDisabled,
      ]}>
      <Text style={styles.pagerBtnText}>{label}</Text>
    </Pressable>
  );
}

/**
 * One staff line, painted from a precomputed {@link SystemLayout}. The SVG's
 * viewBox is the system's own vertical bounds, and `aspectRatio` keeps the
 * on-screen scale uniform with the container width on every device (no
 * letterboxing, no clipping).
 */
function SystemStaff({ system }: { system: SystemLayout }) {
  const { minY, height } = system;
  return (
    <Svg
      width="100%"
      style={{ aspectRatio: LINE_WIDTH / height }}
      viewBox={`0 ${minY} ${LINE_WIDTH} ${height}`}>
      {/* Staff lines */}
      <G stroke="#3A4658" strokeWidth={1} opacity={0.7}>
        {STAFF_LINES.map((y) => (
          <Line key={y} x1={6} y1={y} x2={294} y2={y} />
        ))}
      </G>

      {/* Treble-clef mark (decorative, matches MusicView's glyph). */}
      <Path
        d="M22 70c0-10 4-16 4-26 0-7-7-9-7-3 0 5 6 6 8 1 3-8-2-16-5-16"
        stroke={Colors.textInk}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />

      {/* Inner (between-measure) bar lines */}
      <G stroke="#3A4658" strokeWidth={1} opacity={0.5}>
        {system.innerBarXs.map((x, i) => (
          <Line key={i} x1={x} y1={TOP_LINE - 6} x2={x} y2={BOTTOM_LINE + 6} />
        ))}
      </G>
      <Line
        x1={END_BAR_X}
        y1={TOP_LINE - 6}
        x2={END_BAR_X}
        y2={BOTTOM_LINE + 6}
        stroke="#3A4658"
        strokeWidth={1.4}
        opacity={0.7}
      />

      {/* Notes */}
      {system.notes.map((p, i) => (
        <NoteGlyph key={i} placed={p} />
      ))}

      {/* Beams */}
      <G stroke={Colors.textInk}>
        {system.beams.map((b, i) => (
          <Line
            key={i}
            x1={b.x1}
            y1={b.y}
            x2={b.x2}
            y2={b.y}
            strokeWidth={b.level === 1 ? BEAM_THICKNESS : BEAM_THICKNESS - 0.5}
          />
        ))}
      </G>

      {/* Slurs */}
      <G stroke={Colors.goldDeep} strokeWidth={1.6} fill="none">
        {system.slurs.map((s, i) => (
          <Path key={i} d={`M${s.x1} ${s.y + 6}q${(s.x2 - s.x1) / 2} 14 ${s.x2 - s.x1} 0`} />
        ))}
      </G>
    </Svg>
  );
}

const FILLED_TYPES = new Set(['quarter', 'eighth', '16th', '32nd', '64th', '']);

const ACCIDENTAL: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 1: '♯', 2: '♯♯' };

function NoteGlyph({ placed }: { placed: PlacedNote }) {
  const { note, x, y, stemUp, stemEndY, flags, ledger } = placed;

  if (note.rest || Number.isNaN(y)) {
    // Simple rest mark centered on the middle line.
    return (
      <SvgText
        x={x}
        y={MIDDLE_LINE + 4}
        fill={Colors.textInk}
        fontSize={14}
        textAnchor="middle">
        𝄽
      </SvgText>
    );
  }

  const filled = FILLED_TYPES.has(note.type);
  const hasStem = !Number.isNaN(stemEndY);
  const stemX = stemUp ? x + STEM_OFFSET_X : x - STEM_OFFSET_X;
  const accidental = ACCIDENTAL[note.pitch?.alter ?? 0];

  return (
    <G>
      {/* Ledger lines */}
      <G stroke={Colors.textInk} strokeWidth={1} opacity={0.8}>
        {ledger.map((ly) => (
          <Line key={ly} x1={x - 8} y1={ly} x2={x + 8} y2={ly} />
        ))}
      </G>

      {/* Note head */}
      <Ellipse
        cx={x}
        cy={y}
        rx={5.2}
        ry={3.8}
        transform={`rotate(-20 ${x} ${y})`}
        fill={filled ? Colors.textInk : 'none'}
        stroke={Colors.textInk}
        strokeWidth={filled ? 0 : 1.4}
      />

      {/* Dot */}
      {note.dots > 0 && <Ellipse cx={x + 8} cy={y} rx={1.1} ry={1.1} fill={Colors.textInk} />}

      {/* Accidental */}
      {accidental && (
        <SvgText
          x={x - 9}
          y={y + 3.5}
          fill={Colors.textInk}
          fontSize={11}
          textAnchor="middle">
          {accidental}
        </SvgText>
      )}

      {/* Stem + flags (beamed notes have flags = 0; the beam line joins tips) */}
      {hasStem && (
        <>
          <Line x1={stemX} y1={y} x2={stemX} y2={stemEndY} stroke={Colors.textInk} strokeWidth={1.3} />
          {Array.from({ length: flags }).map((_, i) => {
            const fy = stemEndY + (stemUp ? i * 5 : -i * 5);
            return (
              <Path
                key={i}
                d={`M${stemX} ${fy}q6 3 5 ${stemUp ? 9 : -9}`}
                stroke={Colors.textInk}
                strokeWidth={1.3}
                fill="none"
              />
            );
          })}
        </>
      )}
    </G>
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

  systems: { gap: 6 },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(27,47,73,.1)',
  },
  pagerLabel: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 11.5,
    letterSpacing: 0.4,
    color: '#5A6472',
  },
  pagerBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(201,162,74,.16)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,.35)',
  },
  pagerBtnPressed: { opacity: 0.7 },
  pagerBtnDisabled: { opacity: 0.35 },
  pagerBtnText: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 12.5,
    color: Colors.goldLabel,
  },

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
