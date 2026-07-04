import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { diatonicIndex, parseMusicXML, type ParsedNote, type ParsedScore } from '@/lib/musicxml';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise } from '@/types';

/**
 * MusicXmlView — the study's music view, rendered from **MusicXML** instead of
 * the hand-drawn placeholder phrase in {@link MusicView}.
 *
 * This is the intended, forward-looking notation surface: once the backend's
 * `StudyContent.musicxml` is populated (see `backend/studies/models.py`) and the
 * mobile API returns it, the Practice and Record screens should render this
 * component with the fetched MusicXML. It matches `MusicView` pixel-for-pixel
 * (same cream "paper" Surface, header row, staff height, and colors) so it is a
 * drop-in replacement — no layout shift when the data goes live.
 *
 * ⚠️ Not wired into any screen yet: no study has notation in the database. Do
 * **not** build a second MusicXML renderer — extend this one. See
 * `docs/architecture.md` → "Notation rendering (MusicXML)".
 *
 * Rendering is intentionally a faithful subset (single staff line of the first
 * measures: note-heads, stems, flags, accidentals, ledger lines, slurs). It uses
 * `react-native-svg` only — no WebView, no native module, works on web too.
 */
interface MusicXmlViewProps {
  exercise?: Exercise;
  /** Canonical MusicXML for the study (from `StudyContent.musicxml`). */
  musicXml?: string;
  loading?: boolean;
}

/** Fixed notation-area height — identical to `MusicView` so states never shift. */
const STAFF_HEIGHT = 84;

// Staff geometry (shared with the static MusicView layout).
const STAFF_LINES = [20, 32, 44, 56, 68] as const;
const TOP_LINE = STAFF_LINES[0];
const BOTTOM_LINE = STAFF_LINES[STAFF_LINES.length - 1];
const MIDDLE_LINE = STAFF_LINES[2];
const STEP = 6; // vertical px per diatonic step (half of the 12px line spacing)
const CONTENT_LEFT = 44; // x after the clef/key area
const CONTENT_RIGHT = 288;
const MAX_NOTES = 24; // cap so a long study still reads on one line

export function MusicXmlView({ exercise, musicXml, loading = false }: MusicXmlViewProps) {
  const score = useMemo(() => (musicXml ? parseMusicXML(musicXml) : undefined), [musicXml]);

  if (loading) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading study…</Text>
        </View>
      </Surface>
    );
  }

  if (!exercise || !score || score.notes.length === 0) {
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

  return (
    <Surface>
      <View style={styles.sheetTop}>
        <Text style={styles.sheetLabel}>FIRST STUDIES · No. {exercise.number}</Text>
        <Text style={styles.sheetKey}>{exercise.key}</Text>
      </View>
      <StaffFromScore score={score} />
    </Surface>
  );
}

/** Cream card that wraps the notation in every state (mirrors MusicView). */
function Surface({ children }: { children: React.ReactNode }) {
  return <View style={styles.sheet}>{children}</View>;
}

interface Placed {
  note: ParsedNote;
  x: number;
  y: number; // NaN for rests
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

function StaffFromScore({ score }: { score: ParsedScore }) {
  const pitchToY = makePitchToY(score);

  // Lay notes out left→right. Chord tones share the previous x slot.
  const notes = score.notes.slice(0, MAX_NOTES);
  const slotCount = Math.max(
    1,
    notes.reduce((n, note, i) => n + (note.chord && i > 0 ? 0 : 1), 0),
  );
  const gap = (CONTENT_RIGHT - CONTENT_LEFT) / Math.max(slotCount, 1);

  const placed: Placed[] = [];
  let slot = -1;
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    if (!(note.chord && i > 0)) slot += 1;
    const x = CONTENT_LEFT + gap * (slot + 0.5);
    const y = note.pitch ? pitchToY(diatonicIndex(note.pitch)) : NaN;
    placed.push({ note, x, y });
  }

  // Pair slur start→stop for phrase arcs.
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

  const measureBars = measureBarX(placed, gap);

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

      {/* Bar lines */}
      <G stroke="#3A4658" strokeWidth={1} opacity={0.5}>
        {measureBars.map((x, i) => (
          <Line key={i} x1={x} y1={TOP_LINE - 6} x2={x} y2={BOTTOM_LINE + 6} />
        ))}
      </G>
      <Line
        x1={294}
        y1={TOP_LINE - 6}
        x2={294}
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
          <Path
            key={i}
            d={`M${s.x1} ${s.y + 6}q${(s.x2 - s.x1) / 2} 14 ${s.x2 - s.x1} 0`}
          />
        ))}
      </G>
    </Svg>
  );
}

/** x-position of the bar line drawn *before* each measure boundary. */
function measureBarX(placed: Placed[], gap: number): number[] {
  const bars: number[] = [];
  for (let i = 1; i < placed.length; i += 1) {
    if (placed[i].note.measureIndex !== placed[i - 1].note.measureIndex) {
      bars.push(placed[i].x - gap * 0.5);
    }
  }
  return bars;
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
