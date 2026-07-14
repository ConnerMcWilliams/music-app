import { MUSICXML_BY_ID } from '@/data/musicxmlCatalog';
import { layoutScore, parseMusicXML } from '@/lib/musicxml';

/**
 * Robustness sweep over every bundled study: whatever the catalog contains
 * (E3–G6 ledger extremes, 16-note chromatic bars, bass-clef studies), no
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
});
