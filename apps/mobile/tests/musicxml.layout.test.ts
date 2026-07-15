import {
  BOTTOM_LINE,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  MIDDLE_LINE,
  TOP_LINE,
  layoutScore,
  parseMusicXML,
  type SystemLayout,
} from '@/lib/musicxml';

/** Build a minimal single-part MusicXML document from measure bodies. */
function scoreXml(...measures: string[]): string {
  const body = measures
    .map((m, i) => `<measure number="${i + 1}">${i === 0 ? ATTRS : ''}${m}</measure>`)
    .join('');
  return `<score-partwise version="3.1"><part id="P1">${body}</part></score-partwise>`;
}

const ATTRS = `<attributes><divisions>4</divisions><key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time>
  <clef><sign>G</sign><line>2</line></clef></attributes>`;

interface NoteOpts {
  alter?: number;
  dots?: number;
  chord?: boolean;
  rest?: boolean;
  beam?: 'begin' | 'continue' | 'end';
  slur?: 'start' | 'stop';
}

function note(step: string, octave: number, type: string, opts: NoteOpts = {}): string {
  const durations: Record<string, number> = {
    '16th': 1,
    eighth: 2,
    quarter: 4,
    half: 8,
    whole: 16,
  };
  const parts = [
    opts.chord ? '<chord/>' : '',
    opts.rest ? '<rest/>' : `<pitch><step>${step}</step>${
      opts.alter ? `<alter>${opts.alter}</alter>` : ''
    }<octave>${octave}</octave></pitch>`,
    `<duration>${durations[type] ?? 4}</duration>`,
    `<type>${type}</type>`,
    '<dot/>'.repeat(opts.dots ?? 0),
    opts.beam ? `<beam number="1">${opts.beam}</beam>` : '',
    opts.slur ? `<notations><slur number="1" type="${opts.slur}"/></notations>` : '',
  ];
  return `<note>${parts.join('')}</note>`;
}

function layout(...measures: string[]) {
  return layoutScore(parseMusicXML(scoreXml(...measures)));
}

function allSystems(pages: SystemLayout[][]): SystemLayout[] {
  return pages.flat();
}

/** Every drawn element's vertical extent must sit inside the system viewBox. */
function assertContained(system: SystemLayout) {
  const top = system.minY;
  const bottom = system.minY + system.height;
  for (const p of system.notes) {
    if (Number.isNaN(p.y)) continue;
    expect(p.y - 4.5).toBeGreaterThanOrEqual(top);
    expect(p.y + 4.5).toBeLessThanOrEqual(bottom);
    for (const ly of p.ledger) {
      expect(ly).toBeGreaterThanOrEqual(top);
      expect(ly).toBeLessThanOrEqual(bottom);
    }
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
}

describe('layoutScore vertical bounds', () => {
  it('expands the viewBox above the staff for high ledger notes (up to G6)', () => {
    const [system] = allSystems(
      layout(
        [note('C', 6, 'quarter'), note('E', 6, 'quarter'), note('F', 6, 'quarter'), note('G', 6, 'quarter')].join(''),
      ),
    );
    // G6 head sits at y = −28, far above the old fixed viewBox top of 0.
    expect(system.minY).toBeLessThanOrEqual(-32);
    expect(Math.min(...system.notes.map((p) => p.y))).toBe(-28);
    const g6 = system.notes[3];
    expect(g6.ledger.length).toBeGreaterThanOrEqual(4);
    assertContained(system);
  });

  it('expands the viewBox below the staff for low ledger notes (down to E3)', () => {
    const [system] = allSystems(
      layout(
        [note('E', 3, 'quarter'), note('G', 3, 'quarter'), note('A', 3, 'quarter'), note('B', 3, 'quarter')].join(''),
      ),
    );
    // E3 head sits at y = 110, far below the old fixed viewBox bottom of 84.
    expect(Math.max(...system.notes.map((p) => p.y))).toBe(110);
    expect(system.minY + system.height).toBeGreaterThanOrEqual(114.5);
    expect(system.notes[0].ledger.length).toBeGreaterThanOrEqual(3);
    assertContained(system);
  });

  it('keeps a plain mid-staff passage compact (no whitespace inflation)', () => {
    const bar = [note('G', 4, 'quarter'), note('A', 4, 'quarter'), note('B', 4, 'quarter'), note('C', 5, 'quarter')].join('');
    const [system] = allSystems(layout(bar, bar));
    expect(system.height).toBeLessThanOrEqual(84);
    expect(system.height).toBeGreaterThanOrEqual(60);
    // The staff frame itself (staff ± margin) is always included.
    expect(system.minY).toBeLessThanOrEqual(TOP_LINE - 8);
    expect(system.minY + system.height).toBeGreaterThanOrEqual(BOTTOM_LINE + 8);
    assertContained(system);
  });

  it('covers slur arcs below low notes', () => {
    const bar = [
      note('C', 4, 'half', { slur: 'start' }),
      note('C', 4, 'half', { slur: 'stop' }),
    ].join('');
    const [system] = allSystems(layout(bar));
    expect(system.slurs).toHaveLength(1);
    assertContained(system);
  });
});

describe('layoutScore horizontal spacing and packing', () => {
  const dense = Array.from({ length: 16 }, (_, i) =>
    note('CDEFGAB'[i % 7], 4, '16th'),
  ).join('');
  const easy = [note('G', 4, 'quarter'), note('B', 4, 'quarter'), note('D', 5, 'half')].join('');

  it('gives a dense 16-sixteenth measure a staff line to itself', () => {
    const systems = allSystems(layout(dense, dense));
    expect(systems).toHaveLength(2);
    for (const system of systems) {
      expect(system.innerBarXs).toHaveLength(0);
      const xs = system.notes.map((p) => p.x);
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(12);
      }
      assertContained(system);
    }
  });

  it('still packs two easy measures onto one staff line', () => {
    const systems = allSystems(layout(easy, easy));
    expect(systems).toHaveLength(1);
    expect(systems[0].innerBarXs).toHaveLength(1);
  });

  it('gives longer durations more room than short ones', () => {
    const bar = [
      note('G', 4, '16th'),
      note('G', 4, '16th'),
      note('A', 4, 'quarter'),
      note('B', 4, 'half'),
    ].join('');
    const [system] = allSystems(layout(bar));
    const [a, b, c, d] = system.notes.map((p) => p.x);
    expect(b - a).toBeLessThan(c - b);
    expect(c - b).toBeLessThan(d - c);
  });

  it('reserves clearance for accidentals so they cannot overlap the previous head', () => {
    const bar = Array.from({ length: 8 }, (_, i) =>
      note('CDEFGABC'[i % 8] || 'C', 4 + (i === 7 ? 1 : 0), '16th', i % 2 ? { alter: 1 } : {}),
    ).join('');
    const [system] = allSystems(layout(bar));
    const xs = system.notes.map((p) => p.x);
    for (let i = 1; i < xs.length; i += 1) {
      // Natural widths: 12 (plain) / 19 (accidental) → centre distance ≥ 15.5
      // before justification, which only stretches here.
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(15.5);
    }
  });

  it('justifies each system to the full content width', () => {
    const systems = allSystems(layout(easy, easy));
    const [system] = systems;
    // Two identical measures split the line at its midpoint.
    expect(system.innerBarXs[0]).toBeCloseTo((CONTENT_LEFT + CONTENT_RIGHT) / 2, 5);
    for (const p of system.notes) {
      expect(p.x).toBeGreaterThan(CONTENT_LEFT);
      expect(p.x).toBeLessThan(CONTENT_RIGHT);
    }
  });

  it('places chord tones on the same x as their lead note', () => {
    const bar = [note('C', 4, 'half'), note('E', 4, 'half', { chord: true }), note('G', 4, 'half')].join('');
    const [system] = allSystems(layout(bar));
    expect(system.notes[1].x).toBe(system.notes[0].x);
    expect(system.notes[2].x).toBeGreaterThan(system.notes[0].x);
  });
});

describe('layoutScore beams', () => {
  const beamedRun = [
    note('C', 5, '16th', { beam: 'begin' }),
    note('D', 5, '16th', { beam: 'continue' }),
    note('E', 5, '16th', { beam: 'continue' }),
    note('F', 5, '16th', { beam: 'end' }),
    note('G', 5, 'quarter'),
  ].join('');

  it('replaces flags with a straight beam across a begin→end run', () => {
    const [system] = allSystems(layout(beamedRun));
    const beamed = system.notes.slice(0, 4);
    for (const p of beamed) {
      expect(p.beamed).toBe(true);
      expect(p.flags).toBe(0);
      expect(p.stemUp).toBe(beamed[0].stemUp);
      expect(p.stemEndY).toBe(beamed[0].stemEndY);
    }
    // The quarter after the run keeps its own stem and no beam.
    expect(system.notes[4].beamed).toBe(false);

    const primary = system.beams.filter((b) => b.level === 1);
    expect(primary).toHaveLength(1);
    expect(Math.min(primary[0].x1, primary[0].x2)).toBeLessThanOrEqual(beamed[0].x + 5);
    expect(Math.max(primary[0].x1, primary[0].x2)).toBeGreaterThanOrEqual(beamed[3].x - 5);
    // 16ths carry a secondary beam: three adjacent segments.
    expect(system.beams.filter((b) => b.level === 2)).toHaveLength(3);
    assertContained(system);
  });

  it('points all stems away from the note farthest from the middle line', () => {
    const high = [
      note('C', 6, '16th', { beam: 'begin' }),
      note('A', 5, '16th', { beam: 'continue' }),
      note('G', 5, '16th', { beam: 'continue' }),
      note('E', 5, '16th', { beam: 'end' }),
    ].join('');
    const [system] = allSystems(layout(high));
    for (const p of system.notes) {
      expect(p.stemUp).toBe(false);
      expect(p.stemEndY).toBeGreaterThan(Math.max(...system.notes.map((q) => q.y)));
    }
    assertContained(system);
  });

  it('draws a hook for an isolated 16th inside an eighth-note group', () => {
    const mixed = [
      note('C', 5, 'eighth', { beam: 'begin' }),
      note('D', 5, '16th', { beam: 'continue' }),
      note('E', 5, 'eighth', { beam: 'end' }),
    ].join('');
    const [system] = allSystems(layout(mixed));
    const hooks = system.beams.filter((b) => b.level === 2);
    expect(hooks).toHaveLength(1);
    expect(Math.abs(hooks[0].x2 - hooks[0].x1)).toBe(8);
  });

  it('falls back to flags when a rest interrupts a beam run', () => {
    const broken = [
      note('C', 5, '16th', { beam: 'begin' }),
      note('', 0, '16th', { rest: true }),
      note('E', 5, '16th', { beam: 'end' }),
    ].join('');
    const [system] = allSystems(layout(broken));
    expect(system.beams).toHaveLength(0);
    const pitched = system.notes.filter((p) => !p.note.rest);
    for (const p of pitched) {
      expect(p.beamed).toBe(false);
      expect(p.flags).toBe(2);
    }
  });

  it('ignores a lone begin with no end', () => {
    const dangling = [note('C', 5, '16th', { beam: 'begin' }), note('D', 5, 'quarter')].join('');
    const [system] = allSystems(layout(dangling));
    expect(system.beams).toHaveLength(0);
    expect(system.notes[0].flags).toBe(2);
  });
});

describe('layoutScore staff variants and edges', () => {
  it('maps bass-clef pitches from G2 on the bottom line', () => {
    const xml = `<score-partwise><part id="P1"><measure number="1">
      <attributes><divisions>4</divisions><clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>16</duration><type>whole</type></note>
    </measure></part></score-partwise>`;
    const [system] = allSystems(layoutScore(parseMusicXML(xml)));
    expect(system.notes[0].y).toBe(BOTTOM_LINE);
  });

  it('gives whole notes no stem and centers rests on the middle line', () => {
    const bar = [note('C', 5, 'whole'), note('', 0, 'quarter', { rest: true })].join('');
    const [system] = allSystems(layout(bar));
    expect(Number.isNaN(system.notes[0].stemEndY)).toBe(true);
    expect(system.notes[0].flags).toBe(0);
    expect(Number.isNaN(system.notes[1].y)).toBe(true);
    // The rest still occupies a horizontal slot.
    expect(system.notes[1].x).toBeGreaterThan(system.notes[0].x);
    expect(MIDDLE_LINE).toBeGreaterThan(system.minY);
  });

  it('returns an empty layout for empty or missing scores', () => {
    expect(layoutScore(undefined)).toEqual([]);
    expect(layoutScore(parseMusicXML('nope'))).toEqual([]);
  });

  it('chunks systems into pages of two', () => {
    const bar = [note('G', 4, 'whole')].join('');
    const pages = layout(bar, bar, bar, bar, bar, bar, bar, bar, bar, bar);
    // 10 easy measures → 5 systems → 3 pages (2+2+1).
    expect(pages).toHaveLength(3);
    expect(pages[0]).toHaveLength(2);
    expect(pages[2]).toHaveLength(1);
  });
});
