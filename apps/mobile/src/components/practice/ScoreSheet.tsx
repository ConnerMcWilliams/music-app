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
  TUPLET_TICK,
  type PlacedNote,
  type SystemLayout,
} from '@/lib/musicxml';
import { Colors, Fonts, Radius } from '@/theme';
import type { NoteState } from '@/types';

/**
 * Shared sheet-music primitives: one staff line, one note, and the page flipper.
 *
 * These are the drawing half of `MusicXmlView`, split out so the embedded card
 * and the fullscreen `ExpandedScoreModal` paint from the *same* code. There is
 * exactly one notation renderer in this app — see `docs/architecture.md` →
 * "Notation rendering (MusicXML)".
 */

/** Ink for each verdict. Exported so legends can't drift from the notation. */
export const NOTE_STATE_COLORS: Record<NoteState, string> = {
  correct: Colors.noteCorrect,
  wrong: Colors.noteWrong,
  missed: Colors.noteMissed,
  active: Colors.textInk,
};

/**
 * One staff line, painted from a precomputed {@link SystemLayout}. The SVG's
 * viewBox is the system's own vertical bounds, and `aspectRatio` keeps the
 * on-screen scale uniform with the container width on every device (no
 * letterboxing, no clipping).
 */
export function SystemStaff({
  system,
  noteStates,
  activeNoteIndex,
}: {
  system: SystemLayout;
  noteStates?: ReadonlyMap<number, NoteState>;
  activeNoteIndex?: number;
}) {
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

      {/* Treble-clef mark (decorative, matches MusicView's glyph). Drawn
          unconditionally, while `layout.ts` places heads from the file's own
          clef — so a bass-clef score would draw bass positions under a treble
          glyph. The corpus is kept all-treble by
          `NotationImportTests.test_every_exercise_is_treble_clef`; read the
          clef here before shipping non-treble notation. */}
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
        <NoteGlyph
          key={i}
          placed={p}
          state={noteStates?.get(p.note.index)}
          active={activeNoteIndex === p.note.index}
        />
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

      {/* Tuplet brackets: end ticks turn toward the heads, numeral in the gap */}
      {system.tuplets.map((t, i) => {
        const tick = t.above ? TUPLET_TICK : -TUPLET_TICK;
        const mid = (t.x1 + t.x2) / 2;
        return (
          <G key={i}>
            <Path
              d={`M${t.x1} ${t.y + tick}V${t.y}H${mid - 4}M${mid + 4} ${t.y}H${t.x2}V${t.y + tick}`}
              stroke={Colors.textInk}
              strokeWidth={1}
              fill="none"
              opacity={0.75}
            />
            <SvgText
              x={mid}
              y={t.y + 3}
              fontSize={8}
              fontStyle="italic"
              textAnchor="middle"
              fill={Colors.textInk}
            >
              {t.number}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

const FILLED_TYPES = new Set(['quarter', 'eighth', '16th', '32nd', '64th', '']);

const ACCIDENTAL: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 1: '♯', 2: '♯♯' };

/**
 * One drawn note.
 *
 * `state` tints every stroke of the glyph — head, stem, flags, dot, accidental
 * and ledger lines — so a verdict reads as one object. Beams and slurs are
 * deliberately left ink-coloured: they span several notes, so a per-note verdict
 * can't colour them unambiguously, and leaving them alone is what keeps
 * `layout.ts` (and its whole-corpus test sweep) untouched by this feature.
 *
 * A judged note also gets a **ring**, not just a colour. Red/green alone is
 * unreadable with the most common colour vision deficiency, and this overlay's
 * entire job is telling right from wrong. The ring sits within the ±6.5 units of
 * headroom `measureBounds` already reserves above a note-head, so it can never
 * clip the viewBox.
 */
function NoteGlyph({
  placed,
  state,
  active = false,
}: {
  placed: PlacedNote;
  state?: NoteState;
  active?: boolean;
}) {
  const { note, x, y, stemUp, stemEndY, flags, ledger } = placed;
  const ink = state ? NOTE_STATE_COLORS[state] : Colors.textInk;
  // "Wrong" and "missed" earn a shape cue; "correct" stays visually quiet so a
  // good run doesn't look busier than a bad one.
  const ringed = state === 'wrong' || state === 'missed';

  if (note.rest || Number.isNaN(y)) {
    // Simple rest mark centered on the middle line. Rests are never judged, so
    // they always stay ink — a coloured rest would imply a verdict.
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
      {/* Playhead halo, behind everything else. */}
      {active && <Ellipse cx={x} cy={y} rx={8} ry={6} fill={Colors.noteActive} />}

      {/* Non-colour verdict cue. */}
      {ringed && (
        <Ellipse cx={x} cy={y} rx={8} ry={6} fill="none" stroke={ink} strokeWidth={1.1} />
      )}

      {/* Ledger lines */}
      <G stroke={ink} strokeWidth={1} opacity={0.8}>
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
        fill={filled ? ink : 'none'}
        stroke={ink}
        strokeWidth={filled ? 0 : 1.4}
      />

      {/* Dot */}
      {note.dots > 0 && <Ellipse cx={x + 8} cy={y} rx={1.1} ry={1.1} fill={ink} />}

      {/* Accidental */}
      {accidental && (
        <SvgText
          x={x - 9}
          y={y + 3.5}
          fill={ink}
          fontSize={11}
          textAnchor="middle">
          {accidental}
        </SvgText>
      )}

      {/* Stem + flags (beamed notes have flags = 0; the beam line joins tips) */}
      {hasStem && (
        <>
          <Line x1={stemX} y1={y} x2={stemX} y2={stemEndY} stroke={ink} strokeWidth={1.3} />
          {Array.from({ length: flags }).map((_, i) => {
            const fy = stemEndY + (stemUp ? i * 5 : -i * 5);
            return (
              <Path
                key={i}
                d={`M${stemX} ${fy}q6 3 5 ${stemUp ? 9 : -9}`}
                stroke={ink}
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

/** Prev / next page flipper, shown only for multi-page studies. */
export function PageControls({
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

const styles = StyleSheet.create({
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
});
