/**
 * Pure engraving layout for a {@link ParsedScore}.
 *
 * `layoutScore` turns the parsed note list into pages → systems of positioned
 * glyphs plus the exact vertical bounds each system needs, so the SVG painter
 * (`MusicXmlView`) never clips ledger-line notes and never collides dense
 * passages. All coordinates are in the fixed 300-unit-wide staff user space
 * the component has always used (staff lines at y 20–68); only the vertical
 * extent of a system varies with its content.
 *
 * Layout rules, in the order they are applied:
 * - Each note/rest gets a *natural width* from its notated duration
 *   (geometric-ish engraving spacing: shorter ≠ proportionally narrower),
 *   plus clearance for accidentals and dots.
 * - Measures pack greedily onto systems: at most {@link MAX_MEASURES_PER_SYSTEM}
 *   per line, only while their natural widths fit the line, and only while the
 *   justified spacing still clears {@link MIN_SLOT_SPACING}; a dense measure
 *   therefore takes a line to itself. Packed measures are then justified to
 *   fill the full content width, exactly like a typeset line.
 * - Level-1 beam runs from the MusicXML replace per-note flags with straight
 *   beams (secondary 16th beams derive from note type); beamed groups share a
 *   stem direction chosen by the note farthest from the middle line.
 * - The system's viewBox bounds are the union of every drawn element's extent
 *   (heads, ledger lines, stems/beams, accidentals, slur arcs) plus a small
 *   pad, never less than the staff frame itself.
 */
import { diatonicIndex, type ParsedNote, type ParsedScore } from './parseMusicXML';

// Staff geometry (single source of truth — the painter imports these).
export const LINE_WIDTH = 300;
export const STAFF_LINES = [20, 32, 44, 56, 68] as const;
export const TOP_LINE = STAFF_LINES[0];
export const BOTTOM_LINE = STAFF_LINES[STAFF_LINES.length - 1];
export const MIDDLE_LINE = STAFF_LINES[2];
export const STEP = 6; // vertical px per diatonic step (half the 12px line gap)
export const CONTENT_LEFT = 44; // x after the clef/key area
export const CONTENT_RIGHT = 288;
export const END_BAR_X = 294; // heavy bar line at the right edge of the staff

/** How the study is broken across staff lines and pages. */
export const MAX_MEASURES_PER_SYSTEM = 2;
export const SYSTEMS_PER_PAGE = 2;

const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

// Glyph geometry shared with the painter.
export const STEM_LENGTH = 22;
export const STEM_OFFSET_X = 4.7; // stem sits on the right of the head when up
export const BEAM_THICKNESS = 3.5;
export const BEAM_GAP = 6; // level-2 beam offset toward the heads
export const BEAM_HOOK = 8; // stub for a lone 16th inside an eighth group
export const TUPLET_GAP = 10; // outermost head → tuplet bracket
export const TUPLET_TICK = 3; // downturned end ticks on the bracket

/** Natural slot width per notated duration, in staff user-space units. */
const TYPE_WIDTH: Record<string, number> = {
  '64th': 12,
  '32nd': 12,
  '16th': 12,
  eighth: 15,
  quarter: 20,
  half: 26,
  whole: 34,
};
const ACCIDENTAL_WIDTH = 7;
const DOT_WIDTH = 4;
/** Clamp for the duration-interpolated branch of {@link naturalWidth} only —
 *  a tuplet slot is deliberately narrower than this (see {@link MIN_SLOT_SPACING}). */
const MIN_TYPE_WIDTH = 12;
const MAX_TYPE_WIDTH = 34;
const QUARTER_WIDTH = 20;

/**
 * Narrowest gap allowed between adjacent slot centres after justification —
 * a note head is ~10.4 units wide, so anything tighter overlaps heads.
 */
export const MIN_SLOT_SPACING = 10.5;

const FLAGGED: Record<string, number> = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };
/** Beam levels per type — how many beams a note of this type carries. */
const BEAM_COUNT: Record<string, number> = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };

export interface PlacedNote {
  note: ParsedNote;
  /** Slot-centre x (chord tones share their lead note's x). */
  x: number;
  /** Head-centre y; NaN for rests. */
  y: number;
  stemUp: boolean;
  /** Stem tip y; NaN when the note has no stem (whole notes, rests). */
  stemEndY: number;
  /** Flag count to draw — 0 when the note is beamed. */
  flags: number;
  /** True when a beam group supplies this note's stem tip. */
  beamed: boolean;
  /** Ledger-line y positions this note needs. */
  ledger: number[];
}

export interface BeamSpec {
  x1: number;
  x2: number;
  y: number;
  /** 1 = primary (eighth) beam, 2 = secondary (16th) beam. */
  level: 1 | 2;
}

export interface SlurSpec {
  x1: number;
  x2: number;
  y: number;
}

export interface TupletSpec {
  x1: number;
  x2: number;
  /** Bracket line y (the numeral is centred on it). */
  y: number;
  /** Numeral to draw — 3 for a triplet. */
  number: number;
  /** True when the bracket sits above the heads (i.e. the stems point down). */
  above: boolean;
}

export interface SystemLayout {
  notes: PlacedNote[];
  beams: BeamSpec[];
  slurs: SlurSpec[];
  tuplets: TupletSpec[];
  /** Between-measure bar line x positions. */
  innerBarXs: number[];
  /** Top of the system's viewBox (can be negative for high ledger notes). */
  minY: number;
  /** Height of the system's viewBox. */
  height: number;
  /**
   * Width of the system's viewBox. {@link LINE_WIDTH} for every ordinary
   * system; wider only when one measure holds more notes than the line can
   * show at {@link MIN_SLOT_SPACING}, which widens the user space rather than
   * letting justification squeeze the heads into each other. The staff is
   * drawn to this width, so a wide system renders smaller, exactly as an
   * engraver fits a dense bar.
   */
  width: number;
}

/** A page is the group of systems shown between page flips. */
export type PageLayout = SystemLayout[];

/** Map a diatonic index to a staff y-coordinate for the score's clef. */
export function makePitchToY(score: ParsedScore) {
  // Bottom staff line: E4 in treble, G2 in bass. (Trumpet/cornet is treble.)
  const refIndex = score.clef === 'bass' ? 2 * 7 + 4 : 4 * 7 + 2;
  return (idx: number) => BOTTOM_LINE - (idx - refIndex) * STEP;
}

/** Ledger-line y-positions needed to reach a note-head above/below the staff. */
export function ledgerLines(y: number): number[] {
  const out: number[] = [];
  if (y < TOP_LINE - 3) {
    for (let ly = TOP_LINE - 12; ly >= y - 3; ly -= 12) out.push(ly);
  } else if (y > BOTTOM_LINE + 3) {
    for (let ly = BOTTOM_LINE + 12; ly <= y + 3; ly += 12) out.push(ly);
  }
  return out;
}

/** Natural engraved width of one note, before justification. */
function naturalWidth(note: ParsedNote, divisions: number): number {
  const typed = TYPE_WIDTH[note.type];
  let base: number;
  if (typed == null) {
    // No <type>: interpolate from the duration ratio to a quarter note. A
    // tuplet's <duration> is already its shortened value, so this branch
    // carries the tuplet ratio implicitly.
    const quarters = divisions > 0 && note.duration > 0 ? note.duration / divisions : 1;
    base = Math.min(
      MAX_TYPE_WIDTH,
      Math.max(MIN_TYPE_WIDTH, QUARTER_WIDTH * Math.pow(1.3, Math.log2(quarters))),
    );
  } else if (note.timeMod) {
    // A tuplet note sounds shorter than its notated type, so it gets a
    // narrower slot — otherwise 12 triplet-16ths would claim the width of 12
    // plain 16ths and blow past the line.
    base = (typed * note.timeMod.normal) / note.timeMod.actual;
  } else {
    base = typed;
  }
  const accidental = note.pitch && note.pitch.alter !== 0 ? ACCIDENTAL_WIDTH : 0;
  return base + accidental + note.dots * DOT_WIDTH;
}

/** One horizontal slot: a lead note plus any chord tones stacked on it. */
interface Slot {
  notes: ParsedNote[];
  width: number;
}

/** Group a measure's notes into slots (chord tones share the lead's slot). */
function buildSlots(notes: ParsedNote[], divisions: number): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const last = slots[slots.length - 1];
    if (note.chord && i > 0 && last) {
      last.notes.push(note);
      last.width = Math.max(last.width, naturalWidth(note, divisions));
    } else {
      slots.push({ notes: [note], width: naturalWidth(note, divisions) });
    }
  }
  return slots;
}

interface MeasureSlots {
  slots: Slot[];
  width: number;
  /** Narrowest slot in the measure — it sets the tightest justified gap. */
  minSlot: number;
}

/**
 * Natural distance between the closest pair of adjacent slot centres.
 *
 * Slots are laid out centre-to-centre, so what a note head can collide with is
 * its neighbour at `(w[i] + w[i+1]) / 2` — not the narrowest slot anywhere on
 * the line. A lone short note between two long ones is nowhere near as tight as
 * its own width suggests, so measuring by the single minimum would widen
 * systems that never had a collision. Returns `Infinity` for a system with
 * fewer than two slots, which cannot collide at all.
 */
function minAdjacentSpan(slots: Slot[]): number {
  let span = Infinity;
  for (let i = 1; i < slots.length; i += 1) {
    span = Math.min(span, (slots[i - 1].width + slots[i].width) / 2);
  }
  return span;
}

/**
 * Pack measures onto systems: fill while the natural widths fit the line, the
 * measure cap isn't hit, and the resulting justified spacing still clears
 * {@link MIN_SLOT_SPACING}. Justification divides the line among the packed
 * natural widths, so adding a measure shrinks every slot — a line of narrow
 * tuplet slots can fit by total width yet still collide, and is split instead.
 * A measure denser than a whole line still gets its own system and is
 * compressed by justification (never clipped — the vertical bounds are
 * computed after placement).
 */
function packSystems(measures: MeasureSlots[]): MeasureSlots[][] {
  const systems: MeasureSlots[][] = [];
  let current: MeasureSlots[] = [];
  let used = 0;
  let minSlot = Infinity;
  for (const measure of measures) {
    const packedWidth = used + measure.width;
    const packedMinSlot = Math.min(minSlot, measure.minSlot);
    const fits =
      current.length > 0 &&
      current.length < MAX_MEASURES_PER_SYSTEM &&
      packedWidth <= CONTENT_WIDTH &&
      (packedMinSlot * CONTENT_WIDTH) / packedWidth >= MIN_SLOT_SPACING;
    if (current.length === 0 || fits) {
      current.push(measure);
      used = packedWidth;
      minSlot = packedMinSlot;
    } else {
      systems.push(current);
      current = [measure];
      used = measure.width;
      minSlot = measure.minSlot;
    }
  }
  if (current.length > 0) systems.push(current);
  return systems;
}

interface BeamGroup {
  placed: PlacedNote[];
}

/**
 * Collect level-1 beam runs (begin → continue… → end) among a measure's lead
 * notes. Anything that interrupts a run — a rest, a whole note, a missing beam
 * state — abandons it, and those notes keep their flags.
 */
function collectBeamGroups(leads: PlacedNote[]): BeamGroup[] {
  const groups: BeamGroup[] = [];
  let run: PlacedNote[] | null = null;
  for (const placed of leads) {
    const { note } = placed;
    const beamable = !note.rest && !Number.isNaN(placed.y) && note.type !== 'whole';
    if (!beamable) {
      run = null;
      continue;
    }
    if (note.beam === 'begin') {
      run = [placed];
    } else if (note.beam === 'continue' && run) {
      run.push(placed);
    } else if (note.beam === 'end' && run) {
      run.push(placed);
      if (run.length >= 2) groups.push({ placed: run });
      run = null;
    } else {
      run = null;
    }
  }
  return groups;
}

/** Resolve stems/flags and beam lines for one measure's placed lead notes. */
function resolveStems(leads: PlacedNote[], beams: BeamSpec[]): void {
  const groups = collectBeamGroups(leads);
  const grouped = new Set<PlacedNote>();

  for (const group of groups) {
    const ys = group.placed.map((p) => p.y);
    // Extreme-note rule: the head farthest from the middle line picks the
    // direction for the whole group (farthest above → stems down).
    const above = Math.max(...ys.map((y) => MIDDLE_LINE - y));
    const below = Math.max(...ys.map((y) => y - MIDDLE_LINE));
    const stemUp = below >= above;
    const beamY = stemUp ? Math.min(...ys) - STEM_LENGTH : Math.max(...ys) + STEM_LENGTH;

    for (const placed of group.placed) {
      placed.stemUp = stemUp;
      placed.stemEndY = beamY;
      placed.flags = 0;
      placed.beamed = true;
      grouped.add(placed);
    }

    const stemX = (p: PlacedNote) => (stemUp ? p.x + STEM_OFFSET_X : p.x - STEM_OFFSET_X);
    const first = group.placed[0];
    const last = group.placed[group.placed.length - 1];
    beams.push({ x1: stemX(first), x2: stemX(last), y: beamY, level: 1 });

    // Secondary (16th) beams: full segments between adjacent double-beam
    // notes, a short hook when a double-beam note has no such neighbour.
    const levelY = stemUp ? beamY + BEAM_GAP : beamY - BEAM_GAP;
    const needsTwo = (p: PlacedNote) => (BEAM_COUNT[p.note.type] ?? 0) >= 2;
    for (let i = 0; i < group.placed.length; i += 1) {
      const p = group.placed[i];
      if (!needsTwo(p)) continue;
      const prev = i > 0 ? group.placed[i - 1] : undefined;
      const next = i < group.placed.length - 1 ? group.placed[i + 1] : undefined;
      if (next && needsTwo(next)) {
        beams.push({ x1: stemX(p), x2: stemX(next), y: levelY, level: 2 });
      } else if (!(prev && needsTwo(prev))) {
        // Isolated double-beam note: hook toward its neighbour in the group.
        const dir = prev ? -1 : 1;
        beams.push({ x1: stemX(p), x2: stemX(p) + dir * BEAM_HOOK, y: levelY, level: 2 });
      }
    }
  }

  // Unbeamed notes keep the classic per-note stem and flags.
  for (const placed of leads) {
    if (grouped.has(placed) || placed.note.rest || Number.isNaN(placed.y)) continue;
    const hasStem = placed.note.type !== 'whole';
    placed.stemUp = placed.y >= MIDDLE_LINE;
    placed.stemEndY = hasStem
      ? placed.stemUp
        ? placed.y - STEM_LENGTH
        : placed.y + STEM_LENGTH
      : NaN;
    placed.flags = hasStem ? (FLAGGED[placed.note.type] ?? 0) : 0;
  }
}

/**
 * Collect tuplet brackets among a measure's lead notes.
 *
 * Uses explicit `<tuplet type="start|stop">` markers when the file has them and
 * otherwise chunks consecutive `<time-modification>` notes into groups of
 * `actual` — Clarke's triplet studies are engraved either way depending on the
 * exporter. Must run *after* {@link resolveStems}: the bracket is placed on the
 * side away from the stems so it never collides with the beam, and is pushed
 * clear of the staff frame so neither it nor its numeral crosses the ruling.
 */
function collectTuplets(leads: PlacedNote[]): TupletSpec[] {
  const out: TupletSpec[] = [];
  let run: PlacedNote[] = [];

  const flush = () => {
    const group = run;
    run = [];
    if (group.length < 2) return;
    const timeMod = group[0].note.timeMod;
    if (!timeMod) return;
    const ys = group.map((p) => p.y).filter((y) => !Number.isNaN(y));
    if (ys.length === 0) return;
    const above = !group[0].stemUp;
    out.push({
      x1: group[0].x,
      x2: group[group.length - 1].x,
      y: above ? Math.min(...ys, TOP_LINE) - TUPLET_GAP : Math.max(...ys, BOTTOM_LINE) + TUPLET_GAP,
      number: timeMod.actual,
      above,
    });
  };

  for (const placed of leads) {
    const timeMod = placed.note.timeMod;
    if (!timeMod) {
      flush();
      continue;
    }
    if (placed.note.tupletStart && run.length > 0) flush();
    run.push(placed);
    if (placed.note.tupletStop || run.length >= timeMod.actual) flush();
  }
  flush();
  return out;
}

/** Pair slur start→stop arcs within one system. */
function pairSlurs(notes: PlacedNote[]): SlurSpec[] {
  const slurs: SlurSpec[] = [];
  const open: PlacedNote[] = [];
  for (const p of notes) {
    if (p.note.slurStart) open.push(p);
    if (p.note.slurStop) {
      const start = open.pop();
      if (start && !Number.isNaN(start.y) && !Number.isNaN(p.y)) {
        slurs.push({ x1: start.x, x2: p.x, y: Math.max(start.y, p.y) });
      }
    }
  }
  return slurs;
}

/**
 * Union of every drawn element's vertical extent, padded, never smaller than
 * the staff frame. Extents mirror the painter's glyph geometry: head ±4.5,
 * stem tip ±4 (covers flags and beam thickness), accidental text −8/+4 around
 * the head, slur arcs bottoming out ~13 below their anchor.
 */
function measureBounds(
  notes: PlacedNote[],
  slurs: SlurSpec[],
  tuplets: TupletSpec[],
): { minY: number; height: number } {
  let top = TOP_LINE - 8;
  let bottom = BOTTOM_LINE + 8;
  for (const p of notes) {
    if (Number.isNaN(p.y)) continue; // rests sit inside the staff
    top = Math.min(top, p.y - 4.5);
    bottom = Math.max(bottom, p.y + 4.5);
    if (!Number.isNaN(p.stemEndY)) {
      top = Math.min(top, p.stemEndY - 4);
      bottom = Math.max(bottom, p.stemEndY + 4);
    }
    if (p.note.pitch && p.note.pitch.alter !== 0) {
      top = Math.min(top, p.y - 8);
      bottom = Math.max(bottom, p.y + 4);
    }
  }
  for (const s of slurs) bottom = Math.max(bottom, s.y + 13);
  // The numeral straddles the bracket line, so reserve room on both sides.
  for (const t of tuplets) {
    top = Math.min(top, t.y - 5);
    bottom = Math.max(bottom, t.y + 5);
  }
  const minY = Math.floor(top - 2);
  return { minY, height: Math.ceil(bottom + 2) - minY };
}

/**
 * Lay out a parsed score: pages → systems of placed glyphs with per-system
 * vertical bounds. Returns `[]` when the score has no notes.
 */
export function layoutScore(score?: ParsedScore): PageLayout[] {
  if (!score || score.notes.length === 0) return [];

  const byMeasure: ParsedNote[][] = [];
  for (const note of score.notes) {
    (byMeasure[note.measureIndex] ??= []).push(note);
  }
  const measures: MeasureSlots[] = byMeasure
    .filter((m) => m && m.length > 0)
    .map((notes) => {
      const slots = buildSlots(notes, score.divisions);
      return {
        slots,
        width: slots.reduce((w, s) => w + s.width, 0),
        minSlot: slots.reduce((w, s) => Math.min(w, s.width), Infinity),
      };
    });
  if (measures.length === 0) return [];

  const pitchToY = makePitchToY(score);
  const systems: SystemLayout[] = packSystems(measures).map((packed) => {
    const totalNatural = packed.reduce((w, m) => w + m.width, 0);
    // packSystems keeps a line's justified spacing above the floor by splitting,
    // but a single measure denser than the whole line cannot be split — Clarke's
    // Study VII Nos. 151-154 put 24 sixteenth-triplets in one common-time bar.
    // Widen the user space for that system instead of crushing the heads. The
    // floor is the closest pair of adjacent slots, measured across the whole
    // packed line so it spans the bar lines too.
    const justified = CONTENT_WIDTH / totalNatural;
    const floorScale = MIN_SLOT_SPACING / minAdjacentSpan(packed.flatMap((m) => m.slots));
    let width = LINE_WIDTH;
    let scale = justified;
    if (floorScale > justified) {
      // Round the widened box up to a whole unit and re-derive the scale from
      // it. Placement accumulates products across the line, so a scale solved
      // for *exactly* the floor leaves the tightest pair a rounding error below
      // it; a unit of slack spread over the line is invisible and leaves every
      // gap unambiguously clear of the head width.
      width = Math.ceil(CONTENT_LEFT + totalNatural * floorScale + (LINE_WIDTH - CONTENT_RIGHT));
      scale = (width - CONTENT_LEFT - (LINE_WIDTH - CONTENT_RIGHT)) / totalNatural;
    }

    const notes: PlacedNote[] = [];
    const beams: BeamSpec[] = [];
    const tuplets: TupletSpec[] = [];
    const innerBarXs: number[] = [];
    let left = CONTENT_LEFT;
    for (let mi = 0; mi < packed.length; mi += 1) {
      const measure = packed[mi];
      const leads: PlacedNote[] = [];
      let cum = 0;
      for (const slot of measure.slots) {
        const x = left + (cum + slot.width / 2) * scale;
        cum += slot.width;
        for (let i = 0; i < slot.notes.length; i += 1) {
          const note = slot.notes[i];
          const y = note.pitch ? pitchToY(diatonicIndex(note.pitch)) : NaN;
          const placed: PlacedNote = {
            note,
            x,
            y,
            stemUp: true,
            stemEndY: NaN,
            flags: 0,
            beamed: false,
            ledger: Number.isNaN(y) ? [] : ledgerLines(y),
          };
          notes.push(placed);
          if (i === 0) leads.push(placed);
        }
      }
      resolveStems(leads, beams);
      tuplets.push(...collectTuplets(leads));
      // Chord tones ride their lead note's stem resolution.
      for (const slot of measure.slots) {
        if (slot.notes.length < 2) continue;
        const lead = notes.find((p) => p.note === slot.notes[0]);
        if (!lead) continue;
        for (const tone of slot.notes.slice(1)) {
          const placed = notes.find((p) => p.note === tone);
          if (!placed) continue;
          placed.stemUp = lead.stemUp;
          placed.stemEndY = lead.stemEndY;
          placed.flags = 0;
          placed.beamed = lead.beamed;
        }
      }
      left += measure.width * scale;
      if (mi < packed.length - 1) innerBarXs.push(left);
    }

    const slurs = pairSlurs(notes);
    const { minY, height } = measureBounds(notes, slurs, tuplets);
    return { notes, beams, slurs, tuplets, innerBarXs, minY, height, width };
  });

  const pages: PageLayout[] = [];
  for (let i = 0; i < systems.length; i += SYSTEMS_PER_PAGE) {
    pages.push(systems.slice(i, i + SYSTEMS_PER_PAGE));
  }
  return pages;
}

/** Default vertical gap between systems, matching `MusicXmlView`'s `styles.systems`. */
export const SYSTEM_GAP = 6;

/**
 * On-screen height of one system when its staff is drawn `renderWidth` wide.
 *
 * The painter locks each system's aspect ratio to its own `width / height`, so
 * the whole glyph set scales uniformly with the container width — this is the
 * inverse of that relation, and the only thing a caller needs in order to know
 * how much vertical room a system will take. A widened system (see
 * {@link SystemLayout.width}) is drawn to the same `renderWidth` as any other,
 * so it renders *shorter*, not taller.
 */
export function systemHeightAt(system: SystemLayout, renderWidth: number): number {
  return (renderWidth * system.height) / (system.width ?? LINE_WIDTH);
}

/**
 * Repack systems onto pages that fill `availableHeight` at a given render width.
 *
 * `layoutScore` pages by a fixed {@link SYSTEMS_PER_PAGE} because the embedded
 * card has no height to speak of. The fullscreen view does, and how much fits
 * depends on the device *and* the orientation: a wide landscape staff is tall,
 * so fewer systems fit but each is far bigger. Measuring beats guessing, so this
 * takes the measured box and packs greedily.
 *
 * Always emits at least one system per page — a system taller than the viewport
 * still has to render somewhere, and an empty page would strand the pager.
 */
export function paginateToHeight(
  systems: SystemLayout[],
  availableHeight: number,
  renderWidth: number,
  gap: number = SYSTEM_GAP,
): PageLayout[] {
  if (systems.length === 0) return [];
  // Before the container has been measured there is nothing to pack against;
  // fall back to the fixed chunking rather than emitting one system per page.
  if (!(availableHeight > 0) || !(renderWidth > 0)) {
    const pages: PageLayout[] = [];
    for (let i = 0; i < systems.length; i += SYSTEMS_PER_PAGE) {
      pages.push(systems.slice(i, i + SYSTEMS_PER_PAGE));
    }
    return pages;
  }

  const pages: PageLayout[] = [];
  let current: SystemLayout[] = [];
  let used = 0;
  for (const system of systems) {
    const height = systemHeightAt(system, renderWidth);
    const packed = current.length === 0 ? height : used + gap + height;
    if (current.length > 0 && packed > availableHeight) {
      pages.push(current);
      current = [system];
      used = height;
    } else {
      current.push(system);
      used = packed;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}
