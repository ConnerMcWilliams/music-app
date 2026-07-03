/**
 * Mock Clarke *catalog* data — the 10 Studies (sections) and their exercises.
 *
 * This mirrors the backend seed (`backend/studies/seed/clarke.py`) and the shape
 * the Django `/api/studies/` endpoint returns, so replacing it with a real fetch
 * later (via `src/services/api.ts`) is a drop-in change: keep `StudySection[]`.
 *
 * The generator below expands the section ranges into one `Exercise` per study,
 * exactly like the backend's `_build_studies()` (slug `clarke-{section}-{local}`,
 * `number` = position within the Study). Notation/keys for non-étude exercises
 * are unknown without the score, so they're left blank — only the verified
 * capstone études carry a key/tempo, matching the backend.
 */
import type { Exercise, ExerciseCategory, StudySection } from '@/types';

interface SectionSpec {
  section: number;
  label: string;
  /** Inclusive global exercise range [first, last] (1..190). */
  first: number;
  last: number;
  category: ExerciseCategory;
  focus: string;
}

// section, label, global range, category bucket, focus — from clarke.py SECTIONS.
const SECTIONS: SectionSpec[] = [
  { section: 1, label: 'First Study', first: 1, last: 26, category: 'Foundational',
    focus: 'Finger dexterity: short legato cells shifted chromatically, very soft.' },
  { section: 2, label: 'Second Study', first: 27, last: 45, category: 'Foundational',
    focus: 'Scalar-to-arpeggiated four-note cells moved through keys; slur then tongue.' },
  { section: 3, label: 'Third Study', first: 46, last: 65, category: 'Articulation',
    focus: 'Slur and articulation flexibility; combined-articulation patterns.' },
  { section: 4, label: 'Fourth Study', first: 66, last: 86, category: 'Flexibility',
    focus: 'Whole-tone / trill-type figures targeting awkward intervals.' },
  { section: 5, label: 'Fifth Study', first: 87, last: 117, category: 'Foundational',
    focus: 'Extended two-octave scales; range and endurance.' },
  { section: 6, label: 'Sixth Study', first: 118, last: 132, category: 'Foundational',
    focus: 'Major and minor scales across registers.' },
  { section: 7, label: 'Seventh Study', first: 133, last: 170, category: 'Flexibility',
    focus: 'Chromatic triplets and arpeggios incl. diminished-7ths, all registers.' },
  { section: 8, label: 'Eighth Study', first: 171, last: 177, category: 'Articulation',
    focus: 'Extended chromatic sequences; soft, then single/triple tongue.' },
  { section: 9, label: 'Ninth Study', first: 178, last: 188, category: 'Foundational',
    focus: 'Progressive chromatic scales — a daily endurance test (no closing étude).' },
  { section: 10, label: 'Tenth Study', first: 189, last: 190, category: 'Foundational',
    focus: 'Lyrical grace-note melodies; the two named folk-melody études.' },
];

interface Etude {
  title: string;
  key: string;
  tempo: string;
}

// Verified capstone études / named melodies, keyed by GLOBAL exercise number.
const ETUDES: Record<number, Etude> = {
  26: { title: 'First Study — Étude', key: 'C major', tempo: '♩ = 120' },
  45: { title: 'Second Study — Étude', key: 'G major', tempo: '♩ = 144' },
  65: { title: 'Third Study — Étude', key: 'C major', tempo: '♩ = 138' },
  86: { title: 'Fourth Study — Étude', key: 'G major', tempo: '♩ = 144' },
  117: { title: 'Fifth Study — Étude', key: 'C major', tempo: '♩ = 176' },
  132: { title: 'Sixth Study — Étude', key: 'C minor', tempo: '♩ = 138' },
  170: { title: 'Seventh Study — Étude', key: 'C major', tempo: '♩ = 152' },
  177: { title: 'Eighth Study — Étude', key: 'C major', tempo: '♩ = 84' },
  189: { title: 'Tenth Study — "An Irish Ballad"', key: 'F major', tempo: '♩ = 72' },
  190: { title: 'Tenth Study — "An Old German Folksong"', key: 'B♭ major', tempo: '♩ = 80' },
};

function buildExercises(spec: SectionSpec): Exercise[] {
  const exercises: Exercise[] = [];
  let local = 0;
  for (let global = spec.first; global <= spec.last; global += 1) {
    local += 1;
    const etude = ETUDES[global];
    exercises.push({
      id: `clarke-${spec.section}-${local}`,
      number: local, // position within the Study
      title: etude ? `${etude.title} (No. ${global})` : `${spec.label}, No. ${local}`,
      subtitle: etude ? 'Capstone étude' : '',
      key: etude?.key ?? '',
      tempo: etude?.tempo ?? '',
      rangeLabel: '',
      category: spec.category,
      estMinutes: etude ? 5 : 3,
    });
  }
  return exercises;
}

export const STUDY_SECTIONS: StudySection[] = SECTIONS.map((spec) => ({
  section: spec.section,
  label: spec.label,
  category: spec.category,
  focus: spec.focus,
  exercises: buildExercises(spec),
}));

/** Flattened list of every catalog study, across all sections. */
export const CATALOG_STUDIES: Exercise[] = STUDY_SECTIONS.flatMap((s) => s.exercises);

/** Look up a section by its Clarke study number (1–10). */
export function getSectionById(section: number | undefined): StudySection | undefined {
  if (section == null) return undefined;
  return STUDY_SECTIONS.find((s) => s.section === section);
}
