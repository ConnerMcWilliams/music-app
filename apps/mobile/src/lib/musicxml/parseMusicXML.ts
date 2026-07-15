/**
 * A tiny, dependency-free MusicXML reader.
 *
 * Why hand-rolled: React Native has no DOM / `DOMParser`, and this app
 * deliberately carries no XML-parser dependency (see the mobile CLAUDE/AGENTS
 * notes on the fragile Expo dependency graph). We only need to pull the handful
 * of elements required to *draw* a study — pitches, durations, slurs/ties, and
 * the staff context — from the canonical `StudyContent.musicxml` the backend
 * stores. This is a pragmatic subset reader, not a conformant MusicXML parser.
 *
 * Supported: `score-partwise` note/rest/chord, `<pitch>` (step/octave/alter),
 * `<type>` + `<dot>`, `<duration>`/`<divisions>`, `<slur>`/`<tie>`/`<tied>`,
 * the first `<clef>`, `<key><fifths>`, and `<time>`. Everything else is ignored.
 * It is tolerant of missing elements and returns a best-effort model.
 */

export type StepName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type ClefKind = 'treble' | 'bass' | 'other';

export interface ParsedPitch {
  step: StepName;
  /** Scientific octave, e.g. 4 for middle C's octave. */
  octave: number;
  /** Chromatic alteration in semitones: -1 flat, +1 sharp, 0 natural. */
  alter: number;
}

export interface ParsedNote {
  /** A rest occupies time but has no pitch. */
  rest: boolean;
  pitch?: ParsedPitch;
  /** Notated duration: 'whole' | 'half' | 'quarter' | 'eighth' | '16th' … */
  type: string;
  /** Raw `<duration>` in divisions (fallback ordering when `type` is absent). */
  duration: number;
  /** Number of augmentation dots. */
  dots: number;
  /** True when this note is stacked on the previous one (a chord tone). */
  chord: boolean;
  /**
   * Level-1 beam state linking this note to its neighbours, when notated.
   * Secondary (16th) beams are derived from `type` at layout time, so deeper
   * `<beam number="2">` levels (including partial hooks) are not stored.
   */
  beam?: 'begin' | 'continue' | 'end';
  slurStart: boolean;
  slurStop: boolean;
  tieStart: boolean;
  tieStop: boolean;
  /** 0-based index of the measure this note belongs to. */
  measureIndex: number;
}

export interface ParsedScore {
  /** Divisions per quarter note (from the first `<divisions>`), default 1. */
  divisions: number;
  clef: ClefKind;
  /** Circle-of-fifths key signature: negative flats, positive sharps. */
  keyFifths: number;
  /** Time-signature numerator / denominator (defaults to 4/4). */
  beats: number;
  beatType: number;
  notes: ParsedNote[];
  /** `<work-title>` or `<movement-title>` when present. */
  title?: string;
}

const STEPS: readonly StepName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** First inner text of `<tag>…</tag>` (non-greedy), or undefined. */
function tagText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return m ? m[1].trim() : undefined;
}

function tagInt(xml: string, tag: string): number | undefined {
  const t = tagText(xml, tag);
  if (t == null) return undefined;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** All `type="…"` values for a repeated self-describing element (slur/tie). */
function typeValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*\\btype="([^"]+)"`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].toLowerCase());
  return out;
}

/**
 * Inner text of the level-1 `<beam>`: an explicit `number="1"` wins wherever
 * it appears; a bare `<beam>` (level 1 by default in MusicXML) is used only
 * when no beam in the note carries a `number` attribute.
 */
function beamLevel1Text(xml: string): string | undefined {
  const re = /<beam\b([^>]*)>([\s\S]*?)<\/beam>/gi;
  let firstBare: string | undefined;
  let sawNumbered = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const num = /\bnumber="([^"]*)"/i.exec(m[1])?.[1];
    if (num === '1') return m[2].trim();
    if (num != null) sawNumbered = true;
    else if (firstBare == null) firstBare = m[2].trim();
  }
  return sawNumbered ? undefined : firstBare;
}

function parseNote(xml: string, measureIndex: number): ParsedNote {
  const step = tagText(xml, 'step')?.toUpperCase() as StepName | undefined;
  const octave = tagInt(xml, 'octave');
  const isRest = /<rest\b/i.test(xml);

  const pitch: ParsedPitch | undefined =
    !isRest && step && STEPS.includes(step) && octave != null
      ? { step, octave, alter: tagInt(xml, 'alter') ?? 0 }
      : undefined;

  // Slur/tie appear both as `<slur>`/`<tie>` and (in `<notations>`) as `<tied>`.
  const slurTypes = typeValues(xml, 'slur');
  const tieTypes = [...typeValues(xml, 'tie'), ...typeValues(xml, 'tied')];

  const beamRaw = beamLevel1Text(xml)?.toLowerCase();
  const beam =
    beamRaw === 'begin' || beamRaw === 'continue' || beamRaw === 'end' ? beamRaw : undefined;

  return {
    rest: isRest || !pitch,
    pitch,
    type: tagText(xml, 'type') ?? '',
    duration: tagInt(xml, 'duration') ?? 0,
    dots: (xml.match(/<dot\b/gi) ?? []).length,
    chord: /<chord\b/i.test(xml),
    beam,
    slurStart: slurTypes.includes('start'),
    slurStop: slurTypes.includes('stop'),
    tieStart: tieTypes.includes('start'),
    tieStop: tieTypes.includes('stop'),
    measureIndex,
  };
}

function readClef(xml: string): ClefKind {
  const sign = tagText(xml, 'sign')?.toUpperCase();
  if (sign === 'G') return 'treble';
  if (sign === 'F') return 'bass';
  return sign ? 'other' : 'treble';
}

/**
 * Parse a MusicXML document into a flat, draw-ready note list.
 *
 * Never throws on malformed input — callers should check `notes.length` (and
 * may show the "unavailable" state) rather than try/catch.
 */
export function parseMusicXML(xml: string): ParsedScore {
  const score: ParsedScore = {
    divisions: 1,
    clef: 'treble',
    keyFifths: 0,
    beats: 4,
    beatType: 4,
    notes: [],
    title: tagText(xml, 'work-title') ?? tagText(xml, 'movement-title') ?? undefined,
  };

  if (!xml || typeof xml !== 'string') return score;

  const measureRe = /<measure\b[^>]*>([\s\S]*?)<\/measure>/gi;
  let measure: RegExpExecArray | null;
  let measureIndex = 0;
  let sawDivisions = false;
  let sawClef = false;
  let sawKey = false;
  let sawTime = false;

  while ((measure = measureRe.exec(xml))) {
    const body = measure[1];

    // Staff context is declared in `<attributes>`, usually only in measure 1.
    if (!sawDivisions) {
      const d = tagInt(body, 'divisions');
      if (d && d > 0) {
        score.divisions = d;
        sawDivisions = true;
      }
    }
    if (!sawClef && /<clef\b/i.test(body)) {
      score.clef = readClef(body);
      sawClef = true;
    }
    if (!sawKey) {
      const f = tagInt(body, 'fifths');
      if (f != null) {
        score.keyFifths = f;
        sawKey = true;
      }
    }
    if (!sawTime && /<time\b/i.test(body)) {
      score.beats = tagInt(body, 'beats') ?? score.beats;
      score.beatType = tagInt(body, 'beat-type') ?? score.beatType;
      sawTime = true;
    }

    const noteRe = /<note\b[\s\S]*?<\/note>/gi;
    let note: RegExpExecArray | null;
    while ((note = noteRe.exec(body))) {
      score.notes.push(parseNote(note[0], measureIndex));
    }
    measureIndex += 1;
  }

  return score;
}

/**
 * Map a pitch to its diatonic staff index (C0 = 0, ascending by scale step).
 * Used by the renderer to place note-heads; exported for testing.
 */
export function diatonicIndex(pitch: ParsedPitch): number {
  return pitch.octave * 7 + STEPS.indexOf(pitch.step);
}
