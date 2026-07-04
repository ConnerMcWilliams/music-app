import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { diatonicIndex, parseMusicXML, type ParsedNote, type ParsedScore } from '@/lib/musicxml';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise } from '@/types';

/**
 * MusicXmlView — the study's music view, rendered from **MusicXML** instead of
 * the hand-drawn placeholder phrase in {@link MusicView}.
 *
 * This is the intended notation surface for Practice and Record: it parses the
 * study's `StudyContent.musicxml` (bundled today as `@/data` → `MUSICXML_BY_ID`)
 * and draws it. It keeps `MusicView`'s cream "paper" Surface, header row, staff
 * geometry, and colors, so the card chrome is unchanged — only the notation is.
 *
 * Layout: notes are engraved like real sheet music — {@link MEASURES_PER_SYSTEM}
 * measures per staff line (system), {@link SYSTEMS_PER_PAGE} systems per page.
 * When a study is longer than one page, page-flip controls appear and the rest
 * of the systems move to the next page.
 *
 * Rendering is intentionally a faithful subset (note-heads, stems, flags,
 * accidentals, ledger lines, bar lines, slurs). It uses `react-native-svg` only
 * — no WebView, no native module, works on web too. See `docs/architecture.md`
 * → "Notation rendering (MusicXML)".
 */
interface MusicXmlViewProps {
  exercise?: Exercise;
  /** Canonical MusicXML for the study (from `StudyContent.musicxml`). */
  musicXml?: string;
  loading?: boolean;
}

/** Fixed notation-area height for the loading/unavailable states (one system). */
const STAFF_HEIGHT = 84;

// Staff geometry (shared with the static MusicView layout).
const STAFF_LINES = [20, 32, 44, 56, 68] as const;
const TOP_LINE = STAFF_LINES[0];
const BOTTOM_LINE = STAFF_LINES[STAFF_LINES.length - 1];
const MIDDLE_LINE = STAFF_LINES[2];
const STEP = 6; // vertical px per diatonic step (half of the 12px line spacing)
const CONTENT_LEFT = 44; // x after the clef/key area
const CONTENT_RIGHT = 288;
const END_BAR_X = 294; // heavy bar line at the right edge of the staff lines

/** How the study is broken across staff lines and pages. */
const MEASURES_PER_SYSTEM = 2;
const SYSTEMS_PER_PAGE = 2; // → 4 measures per page

/** A measure is its notes; a system holds a few measures; a page holds systems. */
type Measure = ParsedNote[];
type System = Measure[];
type Page = System[];

export function MusicXmlView({ exercise, musicXml, loading = false }: MusicXmlViewProps) {
  const score = useMemo(() => (musicXml ? parseMusicXML(musicXml) : undefined), [musicXml]);
  const pages = useMemo(() => buildPages(score), [score]);

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
        {systems.map((measures, i) => (
          <SystemStaff key={i} measures={measures} score={score} />
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

interface Placed {
  note: ParsedNote;
  x: number;
  y: number; // NaN for rests
}

/** Split the flat note list into measures → systems → pages. */
function buildPages(score?: ParsedScore): Page[] {
  if (!score || score.notes.length === 0) return [];
  const measures: Measure[] = [];
  for (const note of score.notes) {
    (measures[note.measureIndex] ??= []).push(note);
  }
  const filled = measures.filter((m) => m && m.length > 0);
  const systems = chunk(filled, MEASURES_PER_SYSTEM);
  return chunk(systems, SYSTEMS_PER_PAGE);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Map a diatonic index to a staff y-coordinate for the score's clef. */
function makePitchToY(score: ParsedScore) {
  // Bottom staff line: E4 in treble, G2 in bass. (Trumpet/cornet is treble.)
  const refIndex = score.clef === 'bass' ? 2 * 7 + 4 : 4 * 7 + 2;
  return (idx: number) => BOTTOM_LINE - (idx - refIndex) * STEP;
}

/** Ledger-line y-positions needed to reach a note-head above/below the staff. */
function ledgerLines(y: number): number[] {
  const out: number[] = [];
  if (y < TOP_LINE - 3) {
    for (let ly = TOP_LINE - 12; ly >= y - 3; ly -= 12) out.push(ly);
  } else if (y > BOTTOM_LINE + 3) {
    for (let ly = BOTTOM_LINE + 12; ly <= y + 3; ly += 12) out.push(ly);
  }
  return out;
}

const ACCIDENTAL: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 1: '♯', 2: '♯♯' };

/** One staff line: up to `MEASURES_PER_SYSTEM` measures, laid out left→right. */
function SystemStaff({ measures, score }: { measures: System; score: ParsedScore }) {
  const pitchToY = makePitchToY(score);
  const measureWidth = (CONTENT_RIGHT - CONTENT_LEFT) / measures.length;

  const placed: Placed[] = [];
  const innerBars: number[] = [];
  measures.forEach((notes, mi) => {
    const left = CONTENT_LEFT + mi * measureWidth;
    // Chord tones share the previous x slot, so only lead notes take a slot.
    const slotCount = Math.max(
      1,
      notes.reduce((n, note, i) => n + (note.chord && i > 0 ? 0 : 1), 0),
    );
    const gap = measureWidth / slotCount;
    let slot = -1;
    for (let i = 0; i < notes.length; i += 1) {
      const note = notes[i];
      if (!(note.chord && i > 0)) slot += 1;
      const x = left + gap * (slot + 0.5);
      const y = note.pitch ? pitchToY(diatonicIndex(note.pitch)) : NaN;
      placed.push({ note, x, y });
    }
    if (mi < measures.length - 1) innerBars.push(left + measureWidth);
  });

  // Pair slur start→stop for phrase arcs within this system.
  const slurs: { x1: number; x2: number; y: number }[] = [];
  const openSlurs: Placed[] = [];
  for (const p of placed) {
    if (p.note.slurStart) openSlurs.push(p);
    if (p.note.slurStop) {
      const start = openSlurs.pop();
      if (start && !Number.isNaN(start.y) && !Number.isNaN(p.y)) {
        slurs.push({ x1: start.x, x2: p.x, y: Math.max(start.y, p.y) });
      }
    }
  }

  return (
    <Svg width="100%" height={STAFF_HEIGHT} viewBox="0 0 300 84">
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
        {innerBars.map((x, i) => (
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
      {placed.map((p, i) => (
        <NoteGlyph key={i} placed={p} />
      ))}

      {/* Slurs */}
      <G stroke={Colors.goldDeep} strokeWidth={1.6} fill="none">
        {slurs.map((s, i) => (
          <Path key={i} d={`M${s.x1} ${s.y + 6}q${(s.x2 - s.x1) / 2} 14 ${s.x2 - s.x1} 0`} />
        ))}
      </G>
    </Svg>
  );
}

const FILLED_TYPES = new Set(['quarter', 'eighth', '16th', '32nd', '64th', '']);
const FLAGGED: Record<string, number> = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };

function NoteGlyph({ placed }: { placed: Placed }) {
  const { note, x, y } = placed;

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
  const hasStem = note.type !== 'whole';
  const stemUp = y >= MIDDLE_LINE;
  const stemX = stemUp ? x + 4.7 : x - 4.7;
  const stemEndY = stemUp ? y - 22 : y + 22;
  const flags = FLAGGED[note.type] ?? 0;
  const accidental = ACCIDENTAL[note.pitch?.alter ?? 0];

  return (
    <G>
      {/* Ledger lines */}
      <G stroke={Colors.textInk} strokeWidth={1} opacity={0.8}>
        {ledgerLines(y).map((ly) => (
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

      {/* Stem + flags */}
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
