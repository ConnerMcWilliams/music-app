import { render } from '@testing-library/react-native';

import ResultsScreen from '@/app/(tabs)/results';
import { buildTimeline, parseMusicXML } from '@/lib/musicxml';
import { setLastGradingResult } from '@/services/lastGradingResult';
import { Colors } from '@/theme';
import type { GradingResult, NoteResult } from '@/types';

// Capture the focus callback without running it. Invoking it on every render
// would call setState in the render phase and loop forever; the screen's
// initial state already reads the hand-off store on mount, which is all these
// tests need. (Same approach as results.focus.test.tsx.)
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: () => {},
}));

jest.mock('@/hooks/useMockQuery', () => ({
  useMockQuery: () => ({ data: null, loading: false, refetch: jest.fn() }),
}));

/**
 * The same fixture `PARITY_XML` in `backend/grading/tests.py` walks.
 *
 * Both languages must produce identical `(index, noteIndex, midi, onsetBeats,
 * durationBeats)` tuples, because `index` is what crosses the wire and
 * `noteIndex` is what colours a glyph. If they drift, verdicts land on the
 * wrong notes on 126 of the 132 bundled studies — silently, and looking
 * entirely plausible. Keep the two fixtures byte-identical.
 */
const PARITY_XML = `<?xml version="1.0"?>
<score-partwise version="3.1">
 <part id="P1">
  <measure number="1">
   <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef></attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><rest/><duration>4</duration><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
     <type>quarter</type><tie type="start"/></note>
  </measure>
  <measure number="2">
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
     <type>quarter</type><tie type="stop"/></note>
   <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><rest/><duration>8</duration><type>half</type></note>
  </measure>
 </part>
</score-partwise>`;

describe('expected-note timeline parity with the grading backend', () => {
  it('produces the tuples backend/grading/tests.py::PARITY_EXPECTED asserts', () => {
    const actual = buildTimeline(parseMusicXML(PARITY_XML)).map((n) => [
      n.index,
      n.noteIndex,
      n.midi,
      n.onsetBeats,
      n.durationBeats,
    ]);
    expect(actual).toEqual([
      [0, 0, 58, 0, 1],
      [1, 2, 62, 2, 1],
      [2, 3, 65, 3, 2],
      [3, 5, 64, 5, 1],
    ]);
  });

  it('keeps the wire index and the glyph index distinct', () => {
    const timeline = buildTimeline(parseMusicXML(PARITY_XML));
    // The rest occupies a glyph slot but no sounding ordinal, so from the
    // second note on, the two numbers part ways.
    expect(timeline.map((n) => n.index)).toEqual([0, 1, 2, 3]);
    expect(timeline.map((n) => n.noteIndex)).toEqual([0, 2, 3, 5]);
  });
});

function gradeWith(overrides: Partial<GradingResult> = {}): GradingResult {
  return {
    submissionId: 's-1',
    exerciseId: 'clarke-1-1',
    exerciseTitle: 'Clarke Study No. 1',
    totalScore: 88,
    gradeLabel: 'B+',
    categories: [{ label: 'Pitch Accuracy', score: 92 }],
    feedbackAuthor: 'Prof. Halvorsen',
    feedbackInitials: 'PH',
    feedbackText: 'Solid take.',
    audioUrl: null,
    studySlug: 'clarke-1-1',
    noteGrading: true,
    noteResults: [
      { index: 0, state: 'correct' },
      { index: 1, state: 'wrong', heardMidi: 61 },
      { index: 2, state: 'missed' },
    ] satisfies NoteResult[],
    noteSummary: { correct: 1, wrong: 1, missed: 1, extra: 0, gradeable: 3 },
    ...overrides,
  };
}

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children?: JsonNode[] | null;
}

function findByType(node: JsonNode | JsonNode[] | null, type: string): JsonNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => findByType(n, type));
  const here = node.type === type ? [node] : [];
  return [...here, ...findByType(node.children ?? null, type)];
}

const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
const paint = (p: unknown) => (p as { payload: number } | null)?.payload;

describe('Results note-by-note overlay', () => {
  it('draws the notation with the verdict colours applied', async () => {
    setLastGradingResult(gradeWith());
    const view = await render(<ResultsScreen />);

    const heads = findByType(view.toJSON() as JsonNode, 'RNSVGEllipse').filter(
      (e) => e.props.rx === 5.2,
    );
    expect(heads.length).toBeGreaterThan(0);

    const inks = heads.map((h) => paint(h.props.stroke));
    expect(inks).toContain(argb(Colors.noteCorrect));
    expect(inks).toContain(argb(Colors.noteWrong));
    expect(inks).toContain(argb(Colors.noteMissed));
  });

  it('shows the tally alongside the notation', async () => {
    setLastGradingResult(gradeWith());
    const { getByText } = await render(<ResultsScreen />);
    expect(getByText('Note by note')).toBeTruthy();
    expect(getByText('1 of 3 correct')).toBeTruthy();
  });

  it('explains the absence rather than silently hiding the section', async () => {
    setLastGradingResult(
      gradeWith({ noteGrading: false, noteResults: [], noteSummary: undefined }),
    );
    const { getByText, queryByText } = await render(<ResultsScreen />);
    expect(getByText(/Note-by-note breakdown isn’t available/)).toBeTruthy();
    expect(queryByText('Note by note')).toBeNull();
  });

  /**
   * A legacy take resolves to a whole Study rather than one of its exercises,
   * so there is no notation the verdicts can be trusted against.
   */
  it('renders nothing extra for a take that predates note grading', async () => {
    const legacy = gradeWith();
    delete legacy.noteGrading;
    delete legacy.noteResults;
    delete legacy.noteSummary;
    delete legacy.studySlug;

    setLastGradingResult(legacy);
    const { queryByText, getByText } = await render(<ResultsScreen />);
    // No overlay and no apology — the concept simply didn't exist for this take.
    expect(queryByText('Note by note')).toBeNull();
    expect(queryByText(/Note-by-note breakdown isn’t available/)).toBeNull();
    expect(getByText('Your Results')).toBeTruthy();
  });

  it('still renders the rest of the screen when a study has no notation', async () => {
    setLastGradingResult(gradeWith({ studySlug: 'clarke-999-1' }));
    const { getByText } = await render(<ResultsScreen />);
    expect(getByText('Your Results')).toBeTruthy();
    expect(getByText(/Note-by-note breakdown isn’t available/)).toBeTruthy();
  });
});
