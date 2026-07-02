/**
 * Mock Clarke study data.
 *
 * TODO(api): replace with a real fetch from the Django exercises endpoint via
 * `src/services/api.ts`. Keep the exported shape (`Exercise[]`) stable so screens
 * don't need to change when this is swapped out.
 */
import type { Exercise } from '@/types';

export const EXERCISES: Exercise[] = [
  {
    id: 'clarke-1',
    number: 1,
    title: 'First Study',
    subtitle: 'Legato slurs · C major',
    key: 'C major',
    tempo: '♩ = 76',
    rangeLabel: 'C4–C5',
    category: 'Foundational',
    estMinutes: 7,
    status: 'completed',
    score: 90,
  },
  {
    id: 'clarke-2',
    number: 2,
    title: 'Second Study',
    subtitle: 'Legato slurs & finger fluency',
    key: 'C major',
    tempo: '♩ = 80',
    rangeLabel: 'G3–C5',
    category: 'Foundational',
    estMinutes: 8,
    status: 'in_progress',
  },
  {
    id: 'clarke-3',
    number: 3,
    title: 'Third Study',
    subtitle: 'Chromatic runs · A minor',
    key: 'A minor',
    tempo: '♩ = 72',
    rangeLabel: 'A3–A4',
    category: 'Flexibility',
    estMinutes: 9,
    status: 'locked',
  },
  {
    id: 'clarke-4',
    number: 4,
    title: 'Fourth Study',
    subtitle: 'Interval leaps · F major',
    key: 'F major',
    tempo: '♩ = 76',
    rangeLabel: 'F3–F5',
    category: 'Flexibility',
    estMinutes: 10,
    status: 'locked',
  },
];
