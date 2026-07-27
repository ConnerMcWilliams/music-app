import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MusicXmlView } from '@/components/practice';
import { LINE_WIDTH } from '@/lib/musicxml';
import { Colors } from '@/theme';
import type { Exercise } from '@/types';

const exercise: Exercise = {
  id: 'clarke-1-1',
  number: 1,
  title: 'First Study',
  subtitle: 'Chromatic patterns · C major',
  key: 'C major',
  tempo: '♩ = 80',
  rangeLabel: 'G3–C5',
  category: 'Foundational',
  estMinutes: 5,
};

const ATTRS = `<attributes><divisions>4</divisions><clef><sign>G</sign><line>2</line></clef></attributes>`;

const HIGH_BAR =
  '<note><pitch><step>G</step><octave>6</octave></pitch><duration>16</duration><type>whole</type></note>';
const PLAIN_BAR =
  '<note><pitch><step>G</step><octave>4</octave></pitch><duration>16</duration><type>whole</type></note>';

function xml(...bars: string[]): string {
  const measures = bars
    .map((b, i) => `<measure number="${i + 1}">${i === 0 ? ATTRS : ''}${b}</measure>`)
    .join('');
  return `<score-partwise><part id="P1">${measures}</part></score-partwise>`;
}

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children?: JsonNode[] | null;
}

/**
 * Collect rendered staff SVGs (react-native-svg's RNSVGSvgView host views).
 *
 * The card header also draws the 24-unit expand affordance, and it comes first
 * in render order, so match on the engraver's `LINE_WIDTH` staff space to keep
 * these the systems only.
 */
function findSvgs(node: JsonNode | JsonNode[] | null): JsonNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(findSvgs);
  const isStaff = node.type === 'RNSVGSvgView' && node.props.vbWidth === LINE_WIDTH;
  return [...(isStaff ? [node] : []), ...findSvgs(node.children ?? null)];
}

// RNTL renders through React 19's concurrent root, so `render` is awaited.
describe('MusicXmlView', () => {
  it('grows the system viewBox above the staff for high ledger notes', async () => {
    const view = await render(<MusicXmlView exercise={exercise} musicXml={xml(HIGH_BAR)} />);
    const [svg] = findSvgs(view.toJSON() as JsonNode);
    // G6's head is at y = −28; the old fixed viewBox ("0 0 300 84") clipped it.
    expect(svg.props.minX).toBe(0);
    expect(svg.props.minY as number).toBeLessThanOrEqual(-32);
    expect(svg.props.vbWidth).toBe(300);
    const height = svg.props.vbHeight as number;
    expect((svg.props.minY as number) + height).toBeGreaterThanOrEqual(76);
    // Height tracks width through aspectRatio — one uniform scale per device.
    expect(StyleSheet.flatten(svg.props.style as object)).toEqual(
      expect.objectContaining({ aspectRatio: 300 / height }),
    );
  });

  it('keeps a plain passage near its classic compact height', async () => {
    const view = await render(
      <MusicXmlView exercise={exercise} musicXml={xml(PLAIN_BAR, PLAIN_BAR)} />,
    );
    const [svg] = findSvgs(view.toJSON() as JsonNode);
    expect(svg.props.vbHeight as number).toBeLessThanOrEqual(84);
  });

  it('pages long studies behind the existing pager', async () => {
    const bars = Array.from({ length: 10 }, () => PLAIN_BAR);
    const { getByText } = await render(
      <MusicXmlView exercise={exercise} musicXml={xml(...bars)} />,
    );
    expect(getByText('Page 1 of 3')).toBeTruthy();
  });

  it('shows the unavailable state without MusicXML', async () => {
    const { getByText } = await render(<MusicXmlView exercise={exercise} />);
    expect(getByText('Notation unavailable')).toBeTruthy();
  });
});

/** Every RNSVG host node of a given type, in render order. */
function findByType(node: JsonNode | JsonNode[] | null, type: string): JsonNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => findByType(n, type));
  const here = node.type === type ? [node] : [];
  return [...here, ...findByType(node.children ?? null, type)];
}

/**
 * react-native-svg lowers colours to packed ARGB ints, so assertions compare
 * against this rather than the hex string the component passes in.
 */
function argb(hex: string): number {
  return (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
}

type Paint = { payload: number } | null | undefined;
const paintOf = (p: unknown) => (p as Paint)?.payload;

/** Note-heads are the rx=5.2 ellipses; halos and verdict rings are rx=8. */
function noteHeads(view: { toJSON: () => unknown }): JsonNode[] {
  return findByType(view.toJSON() as JsonNode, 'RNSVGEllipse').filter((e) => e.props.rx === 5.2);
}

/**
 * A note-head's ink. Filled heads (quarter and shorter) carry it in `fill`,
 * hollow ones (half, whole) only in `stroke`; `stroke` is set for both, so it
 * is the reliable accessor.
 */
const headInk = (head: JsonNode) => paintOf(head.props.stroke);

/** Verdict rings: outlined, no fill. */
function verdictRings(view: { toJSON: () => unknown }): JsonNode[] {
  return findByType(view.toJSON() as JsonNode, 'RNSVGEllipse').filter(
    (e) => e.props.rx === 8 && e.props.fill == null,
  );
}

/** Playhead halos: filled, no stroke. */
function halos(view: { toJSON: () => unknown }): JsonNode[] {
  return findByType(view.toJSON() as JsonNode, 'RNSVGEllipse').filter(
    (e) => e.props.rx === 8 && e.props.fill != null,
  );
}

const THREE_BAR = [PLAIN_BAR, PLAIN_BAR, PLAIN_BAR];

describe('MusicXmlView note verdicts', () => {
  it('renders identically to plain notation when no verdicts are given', async () => {
    const a = await render(<MusicXmlView exercise={exercise} musicXml={xml(...THREE_BAR)} />);
    const before = JSON.stringify(a.toJSON());

    const b = await render(
      <MusicXmlView exercise={exercise} musicXml={xml(...THREE_BAR)} noteStates={new Map()} />,
    );
    expect(JSON.stringify(b.toJSON())).toBe(before);
  });

  it('tints only the notes it is given, keyed by ParsedNote.index', async () => {
    const view = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...THREE_BAR)}
        noteStates={new Map([
          [0, 'correct' as const],
          [2, 'wrong' as const],
        ])}
      />,
    );

    const heads = noteHeads(view);
    expect(heads).toHaveLength(3);
    expect(headInk(heads[0])).toBe(argb(Colors.noteCorrect));
    expect(headInk(heads[1])).toBe(argb(Colors.textInk)); // untouched
    expect(headInk(heads[2])).toBe(argb(Colors.noteWrong));
  });

  it('gives wrong and missed notes a shape cue, not colour alone', async () => {
    const wrong = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...THREE_BAR)}
        noteStates={new Map([[0, 'wrong' as const]])}
      />,
    );
    expect(verdictRings(wrong)).toHaveLength(1);

    const missed = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...THREE_BAR)}
        noteStates={new Map([[1, 'missed' as const]])}
      />,
    );
    expect(verdictRings(missed)).toHaveLength(1);

    // A correct note stays quiet — no ring, so a good run doesn't look busy.
    const correct = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...THREE_BAR)}
        noteStates={new Map([[0, 'correct' as const]])}
      />,
    );
    expect(verdictRings(correct)).toHaveLength(0);
  });

  it('draws a halo behind the active note', async () => {
    const view = await render(
      <MusicXmlView exercise={exercise} musicXml={xml(...THREE_BAR)} activeNoteIndex={1} />,
    );
    expect(halos(view)).toHaveLength(1);
  });

  it('ignores an out-of-range note index', async () => {
    const view = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...THREE_BAR)}
        noteStates={new Map([[99, 'wrong' as const]])}
        activeNoteIndex={99}
      />,
    );
    expect(verdictRings(view)).toHaveLength(0);
    expect(halos(view)).toHaveLength(0);
    expect(noteHeads(view).every((h) => headInk(h) === argb(Colors.textInk))).toBe(true);
  });

  it('keeps verdict colours inside the existing viewBox', async () => {
    const plain = await render(<MusicXmlView exercise={exercise} musicXml={xml(HIGH_BAR)} />);
    const judged = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(HIGH_BAR)}
        noteStates={new Map([[0, 'wrong' as const]])}
        activeNoteIndex={0}
      />,
    );
    // The ring is drawn within the headroom measureBounds already reserves, so
    // adding a verdict must never resize the system.
    const [a] = findSvgs(plain.toJSON() as JsonNode);
    const [b] = findSvgs(judged.toJSON() as JsonNode);
    expect(b.props.minY).toBe(a.props.minY);
    expect(b.props.vbHeight).toBe(a.props.vbHeight);
  });

  it('flips pages to follow the active note only when asked', async () => {
    const bars = Array.from({ length: 10 }, () => PLAIN_BAR);
    const noFollow = await render(
      <MusicXmlView exercise={exercise} musicXml={xml(...bars)} activeNoteIndex={9} />,
    );
    expect(noFollow.getByText('Page 1 of 3')).toBeTruthy();

    const follow = await render(
      <MusicXmlView
        exercise={exercise}
        musicXml={xml(...bars)}
        activeNoteIndex={9}
        followActiveNote
      />,
    );
    expect(follow.getByText('Page 3 of 3')).toBeTruthy();
  });
});
