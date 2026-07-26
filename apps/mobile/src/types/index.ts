/**
 * Shared domain types for the Clarke Coach mobile app.
 *
 * These intentionally mirror the shapes the Django backend is expected to return
 * (see `docs/architecture.md` and `docs/grading-rubric.md`) so that swapping the
 * mock data in `src/data` for real API calls later is a drop-in change.
 */

export type ExerciseStatus = 'completed' | 'in_progress' | 'locked';

/**
 * How one notated note was played, as shown on the notation overlay.
 *
 * Shared verbatim by both feedback surfaces — the live analytical overlay and
 * the graded results overlay — so a player never sees one vocabulary while
 * practising and a different one in their results.
 *
 * Kept to four values on purpose. Timing and intonation detail travel as
 * separate scalars (see {@link NoteResult}) rather than as more enum members,
 * so `MusicXmlView` only ever has to know about four colours and each producer
 * stays free to tune its own thresholds.
 */
export type NoteState = 'correct' | 'wrong' | 'missed' | 'active';

export interface NoteResult {
  /** `ExpectedNote.index` — the sounding-note ordinal shared with the backend. */
  index: number;
  state: NoteState;
  /** Signed onset error in beats; positive is late. Absent when missed. */
  timingErrorBeats?: number;
  /** Signed cents from the expected sounding pitch. Absent when missed. */
  centsError?: number;
  /** Rounded sounding MIDI actually heard — powers "expected D, heard C♯". */
  heardMidi?: number;
}

export interface NoteSummary {
  correct: number;
  wrong: number;
  missed: number;
  /** Played notes that matched no notated note. */
  extra: number;
  /** Notes that could be judged at all — the denominator for the others. */
  gradeable: number;
}

export type ExerciseCategory = 'Foundational' | 'Articulation' | 'Flexibility';

export interface Exercise {
  id: string;
  /** Clarke study number, e.g. 2 for "Second Study". */
  number: number;
  title: string;
  /** Short descriptor, e.g. "Legato slurs · C major". */
  subtitle: string;
  key: string;
  /** Quarter-note tempo marking, e.g. "♩ = 80". */
  tempo: string;
  /** Playable range label, e.g. "G3–C5". */
  rangeLabel: string;
  category: ExerciseCategory;
  estMinutes: number;
  /**
   * Per-user progress state. Optional because it depends on submissions/progress
   * (a later, separate concern) — the raw catalog studies mirrored from the
   * backend carry no per-user state, so it is undefined for them.
   */
  status?: ExerciseStatus;
  /** Last graded score (0–100) when the study has been completed. */
  score?: number;
}

/**
 * A Clarke "Study" — the grouping a client browses (First Study … Tenth Study),
 * each containing many individual exercises (studies). Mirrors the backend's
 * section fields (`section`, `section_label`, `category`) plus its exercises.
 */
export interface StudySection {
  /** Clarke study number, 1–10. */
  section: number;
  /** Display label, e.g. "Second Study". */
  label: string;
  category: ExerciseCategory;
  /** Short description of what the section drills. */
  focus: string;
  /** The individual exercises (studies) that make up this section. */
  exercises: Exercise[];
}

export interface Submission {
  id: string;
  exerciseId: string;
  title: string;
  /** Pre-formatted date label for display, e.g. "Jun 11". */
  dateLabel: string;
  /** Pre-formatted clip length, e.g. "0:48". */
  durationLabel: string;
  score: number;
  /** Raw submission timestamp (ISO 8601), for sorting/formatting. */
  createdAt: string;
  /** Raw clip length in seconds. */
  durationSeconds: number;
  /** Absolute URL of the stored recording, or null when unavailable. */
  audioUrl: string | null;
  /** The stored grade for this take, or null when it hasn't been graded. */
  grade: GradingResult | null;
}

export interface GradingCategory {
  label: string;
  /** 0–100 sub-score for this rubric category. */
  score: number;
}

export interface GradingResult {
  submissionId: string;
  exerciseId: string;
  exerciseTitle: string;
  /** Overall score out of 100. */
  totalScore: number;
  /** Letter grade label, e.g. "A−". */
  gradeLabel: string;
  categories: GradingCategory[];
  feedbackAuthor: string;
  feedbackInitials: string;
  feedbackText: string;
  /**
   * Absolute URL of the stored recording, when viewing a past submission.
   * A just-submitted take (local file only) leaves this undefined.
   */
  audioUrl?: string | null;
  /**
   * XP this take awarded — the improvement over the study's prior best (0 when
   * it didn't beat it). Present for graded takes; undefined for the mock.
   */
  xpAwarded?: number;
  /**
   * Level-up details, present only on a *freshly submitted* take (the POST
   * response). Past submissions from history carry only `xpAwarded`.
   */
  coinsAwarded?: number;
  level?: number;
  rankTitle?: string;
  leveledUp?: boolean;
  /**
   * Which study the take was actually graded against, e.g. `clarke-2-5`.
   *
   * The Results overlay needs this rather than `exerciseId` to choose the
   * notation, because legacy takes carry a section-level id (`clarke-2`) that
   * names a whole Study rather than one of its exercises.
   */
  studySlug?: string | null;
  /**
   * True when Pitch and Rhythm were scored note-by-note against the notation
   * rather than by the reference-free heuristics. The overlay renders only when
   * this is set — a stored grade from before note-level scoring, or a take that
   * couldn't be aligned, has verdicts that would be misleading to draw.
   */
  noteGrading?: boolean;
  /** Per-note verdicts, keyed by the sounding-note ordinal. */
  noteResults?: NoteResult[];
  noteSummary?: NoteSummary;
}

export interface ProgressPoint {
  /** X-axis label, e.g. "Apr". */
  label: string;
  /** Score value 0–100. */
  value: number;
}

export interface UserProfile {
  name: string;
  initials: string;
  /** Membership label, e.g. "Joined 2024". */
  joined: string;
  dayStreak: number;
  personalBest: number;
  studiesDone: number;
  avgScore: number;
  /** Lifetime experience points (only ever grows). */
  xp: number;
  /** Current level, derived from `xp`. */
  level: number;
  /** Rank title for the current level, e.g. "Cornetist". */
  rankTitle: string;
  /** XP earned past the current level's threshold. */
  xpIntoLevel: number;
  /** XP span from the current level to the next (0 before stats load). */
  xpForNextLevel: number;
  /** Spendable coin balance (earned on level-up). */
  coins: number;
  /** Streak freezes currently held. */
  streakFreezes: number;
  /** Coin cost of one streak freeze. */
  freezeCost: number;
  /** Most streak freezes that can be held at once. */
  maxFreezes: number;
}
