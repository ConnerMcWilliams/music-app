import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MusicXmlView } from '@/components/practice';
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

/** Collect rendered SVG roots (react-native-svg's RNSVGSvgView host views). */
function findSvgs(node: JsonNode | JsonNode[] | null): JsonNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(findSvgs);
  const here = node.type === 'RNSVGSvgView' ? [node] : [];
  return [...here, ...findSvgs(node.children ?? null)];
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
