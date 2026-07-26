import {
  CONTENT_LEFT,
  CONTENT_RIGHT,
  TUPLET_GAP,
  layoutScore,
  parseMusicXML,
  type SystemLayout,
} from '@/lib/musicxml';

/**
 * Tuplet support exists for Clarke's Studies VIII and IX Nos. 184-186, which are
 * engraved in 2/4 with sixteenth-note triplets, and for Study VII No. 154
 * (common time, sixteenth triplets). Without `<time-modification>` those bars
 * claim the horizontal space of untupleted notes and overrun the line.
 */

const ATTRS =
  `<attributes><divisions>12</divisions><key><fifths>1</fifths></key>` +
  `<time><beats>2</beats><beat-type>4</beat-type></time>` +
  `<clef><sign>G</sign><line>2</line></clef></attributes>`;

interface TripletOpts {
  bracket?: boolean;
  beam?: 'begin' | 'continue' | 'end';
  rest?: boolean;
}

/** One sixteenth-triplet note: 3 in the time of 2. */
function triplet(step: string, octave: number, pos: 'start' | 'mid' | 'stop', o: TripletOpts = {}) {
  const tupletTag =
    o.bracket !== false && pos !== 'mid'
      ? `<notations><tuplet type="${pos === 'start' ? 'start' : 'stop'}" number="1"/></notations>`
      : '';
  return (
    `<note>` +
    (o.rest ? '<rest/>' : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`) +
    `<duration>2</duration><type>16th</type>` +
    `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes>` +
    `</time-modification>` +
    (o.beam ? `<beam number="1">${o.beam}</beam>` : '') +
    tupletTag +
    `</note>`
  );
}

function plain(step: string, octave: number, type = '16th', duration = 3) {
  return (
    `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch>` +
    `<duration>${duration}</duration><type>${type}</type></note>`
  );
}

function scoreXml(...measures: string[]) {
  const body = measures
    .map((m, i) => `<measure number="${i + 1}">${i === 0 ? ATTRS : ''}${m}</measure>`)
    .join('');
  return `<score-partwise version="3.1"><part id="P1">${body}</part></score-partwise>`;
}

function layout(...measures: string[]) {
  return layoutScore(parseMusicXML(scoreXml(...measures)));
}

function only(pages: SystemLayout[][]): SystemLayout {
  const systems = pages.flat();
  expect(systems).toHaveLength(1);
  return systems[0];
}

/** A bar of 12 sixteenth-triplets — the shape of Study VIII / IX 184-186. */
function tripletBar(steps: string[]): string {
  return steps
    .map((s, i) => {
      const pos = i % 3 === 0 ? 'start' : i % 3 === 2 ? 'stop' : 'mid';
      const beam = i % 3 === 0 ? 'begin' : i % 3 === 2 ? 'end' : 'continue';
      return triplet(s, 4, pos as 'start' | 'mid' | 'stop', { beam });
    })
    .join('');
}

describe('parseMusicXML tuplets', () => {
  it('reads time-modification and tuplet bracket markers', () => {
    const score = parseMusicXML(
      scoreXml(triplet('G', 4, 'start') + triplet('A', 4, 'mid') + triplet('B', 4, 'stop')),
    );
    expect(score.notes).toHaveLength(3);
    expect(score.notes[0].timeMod).toEqual({ actual: 3, normal: 2 });
    expect(score.notes[0].tupletStart).toBe(true);
    expect(score.notes[0].tupletStop).toBe(false);
    expect(score.notes[1].tupletStart).toBe(false);
    expect(score.notes[1].tupletStop).toBe(false);
    expect(score.notes[2].tupletStop).toBe(true);
  });

  it('leaves timeMod undefined on ordinary notes', () => {
    const score = parseMusicXML(scoreXml(plain('G', 4)));
    expect(score.notes[0].timeMod).toBeUndefined();
    expect(score.notes[0].tupletStart).toBe(false);
  });

  it('ignores a malformed time-modification rather than throwing', () => {
    const xml = scoreXml(
      `<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration>` +
        `<type>16th</type><time-modification><actual-notes>0</actual-notes>` +
        `<normal-notes>2</normal-notes></time-modification></note>`,
    );
    expect(parseMusicXML(xml).notes[0].timeMod).toBeUndefined();
  });
});

describe('layout tuplets', () => {
  it('gives a triplet bar 2/3 the width of an equal-count plain bar beside it', () => {
    // 3 triplet-16ths share a system with 3 plain 16ths. Natural widths are
    // 8 vs 12 per note, so the bar line should land two-fifths across.
    const system = only(
      layout(tripletBar(['G', 'A', 'B']), plain('G', 4) + plain('A', 4) + plain('B', 4)),
    );
    expect(system.innerBarXs).toHaveLength(1);
    const [barX] = system.innerBarXs;
    const tripletSpan = barX - CONTENT_LEFT;
    const plainSpan = CONTENT_RIGHT - barX;
    expect(tripletSpan / plainSpan).toBeCloseTo(2 / 3, 2);
  });

  it('packs a 12-note triplet bar onto one system without collisions', () => {
    const system = only(layout(tripletBar(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D'])));
    expect(system.notes).toHaveLength(12);
    const xs = system.notes.map((p) => p.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(10.5);
    }
  });

  it('emits one bracket per group of three with the numeral 3', () => {
    const system = only(layout(tripletBar(['G', 'A', 'B', 'C', 'D', 'E'])));
    expect(system.tuplets).toHaveLength(2);
    for (const t of system.tuplets) {
      expect(t.number).toBe(3);
      expect(t.x2).toBeGreaterThan(t.x1);
    }
    expect(system.tuplets[1].x1).toBeGreaterThan(system.tuplets[0].x2);
  });

  it('places the bracket clear of the stems', () => {
    const system = only(layout(tripletBar(['G', 'A', 'B'])));
    const [t] = system.tuplets;
    const ys = system.notes.map((p) => p.y);
    if (t.above) {
      expect(t.y).toBeLessThanOrEqual(Math.min(...ys) - TUPLET_GAP);
      expect(system.notes.every((p) => !p.stemUp)).toBe(true);
    } else {
      expect(t.y).toBeGreaterThanOrEqual(Math.max(...ys) + TUPLET_GAP);
      expect(system.notes.every((p) => p.stemUp)).toBe(true);
    }
  });

  it('keeps the bracket inside the system viewBox', () => {
    const system = only(layout(tripletBar(['G', 'A', 'B', 'C', 'D', 'E'])));
    for (const t of system.tuplets) {
      expect(t.y - 5).toBeGreaterThanOrEqual(system.minY);
      expect(t.y + 5).toBeLessThanOrEqual(system.minY + system.height);
    }
  });

  it('groups by actual-notes when the file has no bracket markers', () => {
    const bar = ['G', 'A', 'B', 'C', 'D', 'E']
      .map((s) => triplet(s, 4, 'mid', { bracket: false, beam: 'continue' }))
      .join('');
    const system = only(layout(bar));
    expect(system.tuplets).toHaveLength(2);
    expect(system.tuplets.every((t) => t.number === 3)).toBe(true);
  });

  it('does not bracket ordinary notes', () => {
    const system = only(layout(plain('G', 4, 'quarter', 12) + plain('A', 4, 'quarter', 12)));
    expect(system.tuplets).toEqual([]);
  });
});
