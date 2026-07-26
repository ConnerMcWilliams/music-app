/**
 * Note-level grading fields, shared by the two endpoints that carry a grade.
 *
 * A freshly submitted take (`POST /api/submissions/`, mapped in `api.ts`) and a
 * take pulled from history (`GET /api/submissions/`, mapped in `submissions.ts`)
 * must produce an identical overlay — the backend deliberately shapes both
 * through one module (`backend/grading/wire.py`) for the same reason, and this
 * is the client half of that contract. Map through here, never inline.
 */
import type { NoteResult, NoteState, NoteSummary } from '@/types';

/**
 * One verdict as it arrives on the wire.
 *
 * Short keys because a long study carries ~150 of them:
 * `i` expected-note index · `v` verdict · `t` timing error in beats ·
 * `c` cents error · `m` MIDI heard.
 */
export interface NoteResultWire {
  i: number;
  v: string;
  t?: number;
  c?: number;
  m?: number;
}

export interface NoteGradingWire {
  study_slug?: string | null;
  note_grading?: boolean;
  /**
   * Absent on a history *list* row, which carries the summary only — the
   * verdicts for the one take a player taps are fetched separately
   * (`fetchSubmissionNoteResults`). Present on the POST response and on the
   * single-submission GET.
   */
  note_results?: NoteResultWire[];
  note_summary?: {
    correct: number;
    wrong: number;
    missed: number;
    extra: number;
    gradeable: number;
  };
}

/** Verdicts the overlay knows how to draw. Anything else is dropped. */
const DRAWABLE: ReadonlySet<string> = new Set<NoteState>(['correct', 'wrong', 'missed']);

function mapNoteResult(row: NoteResultWire): NoteResult | null {
  if (typeof row?.i !== 'number' || !DRAWABLE.has(row.v)) return null;
  return {
    index: row.i,
    state: row.v as NoteState,
    ...(typeof row.t === 'number' ? { timingErrorBeats: row.t } : {}),
    ...(typeof row.c === 'number' ? { centsError: row.c } : {}),
    ...(typeof row.m === 'number' ? { heardMidi: row.m } : {}),
  };
}

/**
 * The note-grading half of a `GradingResult`, from either endpoint's payload.
 *
 * Defensive about absent fields: a backend predating note-level grading, or a
 * stored row from before it, simply yields `noteGrading: false` and no overlay.
 */
export function mapNoteGrading(wire: NoteGradingWire): {
  studySlug?: string | null;
  noteGrading: boolean;
  noteResults: NoteResult[];
  noteSummary?: NoteSummary;
} {
  const carriesVerdicts = Array.isArray(wire.note_results);
  const noteResults = (wire.note_results ?? [])
    .map(mapNoteResult)
    .filter((r): r is NoteResult => r !== null);

  return {
    studySlug: wire.study_slug ?? null,
    // Never claim note grading without verdicts to show for it — unless the
    // payload never offered any, which is a summary-only history row: there the
    // flag is what tells the Results screen there are verdicts worth fetching.
    noteGrading:
      Boolean(wire.note_grading) && (!carriesVerdicts || noteResults.length > 0),
    noteResults,
    ...(wire.note_summary ? { noteSummary: wire.note_summary } : {}),
  };
}
