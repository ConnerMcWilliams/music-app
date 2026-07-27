import { MUSICXML_BY_ID } from '@/data/musicxmlCatalog';
import { LINE_WIDTH, layoutScore, parseMusicXML } from '@/lib/musicxml';

/**
 * Robustness sweep over every bundled study: whatever the catalog contains
 * (E3–G6 ledger extremes, 16-note chromatic bars; all treble clef), no
 * drawn element may leave its system's computed viewBox and no two adjacent
 * notes may collide. This is the regression net for the notation layout.
 */
describe('layoutScore across the full bundled catalog', () => {
  const entries = Object.entries(MUSICXML_BY_ID);

  it('has the full catalog available', () => {
    expect(entries.length).toBeGreaterThanOrEqual(132);
  });

  it.each(entries.map(([id]) => id))('lays out %s without clipping or collisions', (id) => {
    const pages = layoutScore(parseMusicXML(MUSICXML_BY_ID[id]));
    expect(pages.length).toBeGreaterThan(0);

    for (const systems of pages) {
      for (const system of systems) {
        const top = system.minY;
        const bottom = system.minY + system.height;

        for (const p of system.notes) {
          if (Number.isNaN(p.y)) continue;
          expect(p.y - 4.5).toBeGreaterThanOrEqual(top);
          expect(p.y + 4.5).toBeLessThanOrEqual(bottom);
          if (!Number.isNaN(p.stemEndY)) {
            expect(p.stemEndY - 4).toBeGreaterThanOrEqual(top);
            expect(p.stemEndY + 4).toBeLessThanOrEqual(bottom);
          }
        }
        for (const b of system.beams) {
          expect(b.y).toBeGreaterThanOrEqual(top);
          expect(b.y).toBeLessThanOrEqual(bottom);
        }
        for (const s of system.slurs) {
          expect(s.y + 13).toBeLessThanOrEqual(bottom);
        }

        // Adjacent slot centres must clear a note-head's width (10.4).
        const leadXs: number[] = [];
        for (const p of system.notes) {
          if (!(p.note.chord && leadXs.length > 0 && p.x === leadXs[leadXs.length - 1])) {
            leadXs.push(p.x);
          }
        }
        for (let i = 1; i < leadXs.length; i += 1) {
          expect(leadXs[i] - leadXs[i - 1]).toBeGreaterThanOrEqual(10.5);
        }
      }
    }
  });

  /**
   * The dense-measure widening is a floor on the *adjacent* slot-centre gap, so
   * it may only fire where heads would actually touch. These studies mix a
   * short slot in among long ones — the narrowest single slot is well under the
   * floor while every adjacent pair clears it comfortably — and measuring by
   * the slot minimum instead would shrink them on screen for nothing.
   */
  it.each([
    'clarke-4-1',
    'clarke-4-13',
    'clarke-5-1',
    'clarke-5-6',
    'clarke-5-15',
    'clarke-5-25',
    'clarke-5-30',
    'clarke-6-2',
    'clarke-6-5',
  ])('keeps every system of %s at the standard width', (id) => {
    const xml = MUSICXML_BY_ID[id];
    expect(xml).toBeDefined();
    const systems = layoutScore(parseMusicXML(xml)).flat();
    expect(systems.length).toBeGreaterThan(0);
    for (const system of systems) expect(system.width).toBe(LINE_WIDTH);
  });

  it('widens only the measures that genuinely cannot be justified', () => {
    const widened = entries
      .filter(([, xml]) =>
        layoutScore(parseMusicXML(xml))
          .flat()
          .some((s) => s.width > LINE_WIDTH),
      )
      .map(([id]) => id)
      .sort();
    // Study VII Nos. 151-154 — 24 sixteenth-triplets in one common-time bar.
    expect(widened).toEqual(['clarke-7-19', 'clarke-7-20', 'clarke-7-21', 'clarke-7-22']);
  });
});
