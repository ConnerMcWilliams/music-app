import { MUSICXML_BY_ID } from '@/data/musicxmlCatalog';
import {
  beatsToSeconds,
  buildTimeline,
  DEFAULT_TRANSPOSE_SEMITONES,
  midiOfPitch,
  noteAtBeat,
  parseMusicXML,
  scoreDurationBeats,
  secondsToBeats,
  timelineBeats,
} from '@/lib/musicxml';

/**
 * Three eighths, a dotted-quarter rest, then a whole note in the next measure.
 * `divisions` is 4, so a quarter note is 4 duration units.
 */
const SAMPLE = `<?xml version="1.0"?>
<score-partwise version="3.1">
 <part id="P1">
  <measure number="1">
   <attributes><divisions>4</divisions><clef><sign>G</sign><line>2</line></clef></attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
   <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
   <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
   <note><rest/><duration>6</duration><type>quarter</type><dot/></note>
  </measure>
  <measure number="2">
   <note><pitch><step>G</step><octave>5</octave></pitch><duration>16</duration><type>whole</type></note>
  </measure>
 </part>
</score-partwise>`;

describe('midiOfPitch', () => {
  it('anchors on the standard reference pitches', () => {
    expect(midiOfPitch({ step: 'C', octave: 4, alter: 0 })).toBe(60); // middle C
    expect(midiOfPitch({ step: 'A', octave: 4, alter: 0 })).toBe(69); // A440
  });

  it('applies accidentals chromatically', () => {
    expect(midiOfPitch({ step: 'F', octave: 4, alter: 1 })).toBe(66);
    expect(midiOfPitch({ step: 'B', octave: 3, alter: -1 })).toBe(58);
  });

  it('is enharmonically consistent', () => {
    // F♯4 and G♭4 are the same sounding pitch.
    expect(midiOfPitch({ step: 'F', octave: 4, alter: 1 })).toBe(
      midiOfPitch({ step: 'G', octave: 4, alter: -1 }),
    );
  });
});

describe('buildTimeline', () => {
  const score = parseMusicXML(SAMPLE);
  const timeline = buildTimeline(score);

  it('emits one entry per sounding note, skipping rests', () => {
    expect(score.notes).toHaveLength(5); // the rest is in score.notes …
    expect(timeline).toHaveLength(4); // … but not in the timeline
  });

  it('advances time through rests without emitting one', () => {
    expect(timeline.map((n) => n.onsetBeats)).toEqual([0, 0.5, 1, 3]);
    expect(timeline.map((n) => n.durationBeats)).toEqual([0.5, 0.5, 0.5, 4]);
    // 0.5 × 3 + 1.5 (rest) + 4 = 7
    expect(timelineBeats(timeline)).toBe(7);
  });

  /**
   * The regression this whole two-field design exists for. `index` is the
   * sounding-note ordinal the grading backend counts; `noteIndex` addresses the
   * glyph in `score.notes`, which includes rests. They diverge after the first
   * rest, which most of the bundled studies contain, so conflating them would
   * mis-colour most of the catalogue, silently.
   */
  it('separates the wire index from the glyph index across a rest', () => {
    expect(timeline.map((n) => n.index)).toEqual([0, 1, 2, 3]);
    expect(timeline.map((n) => n.noteIndex)).toEqual([0, 1, 2, 4]);

    const whole = timeline[3];
    expect(whole.index).toBe(3);
    expect(whole.noteIndex).toBe(4);
    expect(score.notes[whole.noteIndex].pitch).toEqual({ step: 'G', octave: 5, alter: 0 });
    // Using `index` as a glyph handle would have coloured the rest instead.
    expect(score.notes[whole.index].rest).toBe(true);
  });

  it('carries the measure a note belongs to', () => {
    expect(timeline.map((n) => n.measureIndex)).toEqual([0, 0, 0, 1]);
  });
});

describe('buildTimeline transposition', () => {
  const score = parseMusicXML(SAMPLE);

  it('applies the B♭ shift exactly once by default', () => {
    const timeline = buildTimeline(score);
    // Written C4/F♯4/A4/G5 sound a major second lower on a B♭ trumpet.
    expect(timeline.map((n) => n.midi)).toEqual([58, 64, 67, 77]);
    expect(DEFAULT_TRANSPOSE_SEMITONES).toBe(-2);
  });

  it('leaves pitches written when transposition is disabled', () => {
    const timeline = buildTimeline(score, { transposeSemitones: 0 });
    expect(timeline.map((n) => n.midi)).toEqual([60, 66, 69, 79]);
  });

  it('shifts by exactly the requested interval — never twice', () => {
    const written = buildTimeline(score, { transposeSemitones: 0 });
    const sounding = buildTimeline(score, { transposeSemitones: -2 });
    written.forEach((note, i) => {
      expect(sounding[i].midi).toBe(note.midi - 2);
    });
  });
});

describe('buildTimeline edge cases', () => {
  it('returns an empty timeline for an unparseable score', () => {
    expect(buildTimeline(parseMusicXML('not xml'))).toEqual([]);
    expect(timelineBeats([])).toBe(0);
  });

  it('skips grace notes without advancing time', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure></part></score-partwise>`;
    const timeline = buildTimeline(parseMusicXML(xml), { transposeSemitones: 0 });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].midi).toBe(60);
    expect(timeline[0].onsetBeats).toBe(0);
  });

  it('skips chord tones so stacked notes share one slot', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure></part></score-partwise>`;
    const timeline = buildTimeline(parseMusicXML(xml), { transposeSemitones: 0 });
    expect(timeline.map((n) => n.midi)).toEqual([60, 62]);
    // The chord tone must not have pushed the following note out to beat 2.
    expect(timeline.map((n) => n.onsetBeats)).toEqual([0, 1]);
  });

  it('merges an adjacent tied pair into one held note', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="start"/></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="stop"/></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure></part></score-partwise>`;
    const timeline = buildTimeline(parseMusicXML(xml), { transposeSemitones: 0 });
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ midi: 77, onsetBeats: 0, durationBeats: 2 });
    // The following note still starts where it should.
    expect(timeline[1]).toMatchObject({ midi: 79, onsetBeats: 2 });
  });

  /**
   * Every `<tie>` in the bundled corpus spans a rest — an OMR artifact from the
   * 1912 scan, not a real tie. Merging across it would fuse two separate notes.
   */
  it('does NOT merge a "tie" that spans a rest', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="start"/></note>
      <note><rest/><duration>4</duration><type>whole</type></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="stop"/></note>
    </measure></part></score-partwise>`;
    const timeline = buildTimeline(parseMusicXML(xml), { transposeSemitones: 0 });
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ onsetBeats: 0, durationBeats: 1 });
    expect(timeline[1]).toMatchObject({ onsetBeats: 5, durationBeats: 1 });
  });

  it('does not merge a tie between different pitches', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="start"/></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type><tie type="stop"/></note>
    </measure></part></score-partwise>`;
    expect(buildTimeline(parseMusicXML(xml))).toHaveLength(2);
  });

  it('counts trailing rests in the score duration but not the note span', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><rest/><duration>3</duration><type>half</type><dot/></note>
    </measure></part></score-partwise>`;
    const score = parseMusicXML(xml);
    expect(timelineBeats(buildTimeline(score))).toBe(1);
    expect(scoreDurationBeats(score)).toBe(4);
  });

  it('treats a missing <divisions> as 1', () => {
    const xml = `<score-partwise><part><measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
    </measure></part></score-partwise>`;
    expect(buildTimeline(parseMusicXML(xml))[0].durationBeats).toBe(2);
  });
});

describe('noteAtBeat', () => {
  const timeline = buildTimeline(parseMusicXML(SAMPLE));

  it('finds the note sounding at a beat', () => {
    expect(noteAtBeat(timeline, 0)?.index).toBe(0);
    expect(noteAtBeat(timeline, 0.4)?.index).toBe(0);
    expect(noteAtBeat(timeline, 1.2)?.index).toBe(2);
    expect(noteAtBeat(timeline, 5)?.index).toBe(3);
  });

  it('uses half-open windows so a boundary belongs to the later note', () => {
    expect(noteAtBeat(timeline, 0.5)?.index).toBe(1);
    expect(noteAtBeat(timeline, 1)?.index).toBe(2);
  });

  it('returns null inside a rest and past the end', () => {
    expect(noteAtBeat(timeline, 2)).toBeNull(); // the dotted-quarter rest
    expect(noteAtBeat(timeline, 99)).toBeNull();
  });
});

describe('tempo conversion', () => {
  it('round-trips beats and seconds', () => {
    expect(beatsToSeconds(4, 120)).toBe(2);
    expect(secondsToBeats(2, 120)).toBe(4);
    expect(secondsToBeats(beatsToSeconds(7, 96), 96)).toBeCloseTo(7, 10);
  });
});

describe('bundled catalogue', () => {
  const ids = Object.keys(MUSICXML_BY_ID);

  it('builds a non-empty, ordered timeline for every bundled study', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const timeline = buildTimeline(parseMusicXML(MUSICXML_BY_ID[id]));
      expect(timeline.length).toBeGreaterThan(0);

      timeline.forEach((note, i) => {
        expect(note.index).toBe(i);
        expect(Number.isFinite(note.midi)).toBe(true);
        expect(note.durationBeats).toBeGreaterThan(0);
        if (i > 0) {
          // Onsets are monotonic and gap-free except across rests.
          expect(note.onsetBeats).toBeGreaterThanOrEqual(
            timeline[i - 1].onsetBeats + timeline[i - 1].durationBeats,
          );
        }
      });
    }
  });

  it('keeps every noteIndex a valid, sounding entry in score.notes', () => {
    for (const id of ids) {
      const score = parseMusicXML(MUSICXML_BY_ID[id]);
      for (const note of buildTimeline(score)) {
        const glyph = score.notes[note.noteIndex];
        expect(glyph).toBeDefined();
        expect(glyph.rest).toBe(false);
        expect(glyph.index).toBe(note.noteIndex);
      }
    }
  });

  /**
   * Guards the tie rule against the real corpus. Every Study 6 file carries a
   * spurious `<tie>` across a whole rest; if the adjacency guard is ever
   * removed these two notes collapse into one and the study mis-aligns.
   */
  it('keeps the spurious Study 6 ties unmerged', () => {
    const study6 = ids.filter((id) => id.startsWith('clarke-6-'));
    expect(study6.length).toBe(14);

    for (const id of study6) {
      const score = parseMusicXML(MUSICXML_BY_ID[id]);
      const timeline = buildTimeline(score);
      const tied = score.notes.filter((n) => n.tieStart || n.tieStop);
      expect(tied).toHaveLength(2);

      // Both tied notes survive as separate expected notes, and the rest
      // between them still separates their onsets.
      const entries = tied.map((n) => timeline.find((e) => e.noteIndex === n.index));
      expect(entries.every((e) => e !== undefined)).toBe(true);
      expect(entries[0]!.index).not.toBe(entries[1]!.index);
      expect(entries[1]!.onsetBeats).toBeGreaterThan(
        entries[0]!.onsetBeats + entries[0]!.durationBeats,
      );
    }
  });

  it('spans the E3–G6 corpus range once transposed', () => {
    const all = ids.flatMap((id) => buildTimeline(parseMusicXML(MUSICXML_BY_ID[id])));
    const midis = all.map((n) => n.midi);
    // Written E3 (52) → 50 sounding; written G6 (91) → 89 sounding.
    expect(Math.min(...midis)).toBeGreaterThanOrEqual(50 - 12);
    expect(Math.max(...midis)).toBeLessThanOrEqual(89 + 12);
  });
});
