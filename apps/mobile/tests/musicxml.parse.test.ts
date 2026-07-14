import { diatonicIndex, parseMusicXML } from '@/lib/musicxml';

const SAMPLE = `<?xml version="1.0"?>
<score-partwise version="3.1">
 <work><work-title>Clarke Study No. 2</work-title></work>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>4</divisions>
    <key><fifths>2</fifths></key>
    <time><beats>3</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type>
     <notations><slur number="1" type="start"/></notations></note>
   <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
   <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type>
     <notations><slur number="1" type="stop"/></notations></note>
   <note><rest/><duration>6</duration><type>quarter</type><dot/></note>
  </measure>
  <measure number="2">
   <note><pitch><step>G</step><octave>5</octave></pitch><duration>16</duration><type>whole</type></note>
  </measure>
 </part>
</score-partwise>`;

describe('parseMusicXML', () => {
  const score = parseMusicXML(SAMPLE);

  it('reads staff context from <attributes>', () => {
    expect(score.divisions).toBe(4);
    expect(score.clef).toBe('treble');
    expect(score.keyFifths).toBe(2);
    expect(score.beats).toBe(3);
    expect(score.beatType).toBe(4);
    expect(score.title).toBe('Clarke Study No. 2');
  });

  it('extracts notes with pitch, accidentals, and type', () => {
    expect(score.notes).toHaveLength(5);
    expect(score.notes[0].pitch).toEqual({ step: 'C', octave: 4, alter: 0 });
    expect(score.notes[1].pitch).toEqual({ step: 'F', octave: 4, alter: 1 });
    expect(score.notes[4].type).toBe('whole');
  });

  it('pairs slur start/stop and marks rests, dots, and measures', () => {
    expect(score.notes[0].slurStart).toBe(true);
    expect(score.notes[2].slurStop).toBe(true);
    expect(score.notes[3].rest).toBe(true);
    expect(score.notes[3].dots).toBe(1);
    expect(score.notes[3].measureIndex).toBe(0);
    expect(score.notes[4].measureIndex).toBe(1);
  });

  it('orders diatonic indices so higher pitches rank higher', () => {
    // C4 < A4 < G5 on the staff.
    expect(diatonicIndex({ step: 'C', octave: 4, alter: 0 })).toBeLessThan(
      diatonicIndex({ step: 'A', octave: 4, alter: 0 }),
    );
    expect(diatonicIndex({ step: 'A', octave: 4, alter: 0 })).toBeLessThan(
      diatonicIndex({ step: 'G', octave: 5, alter: 0 }),
    );
  });

  it('returns an empty, safe model for junk input', () => {
    const empty = parseMusicXML('not xml at all');
    expect(empty.notes).toHaveLength(0);
    expect(empty.clef).toBe('treble');
  });

  it('reads the level-1 beam state and ignores deeper beam levels', () => {
    const xml = `<score-partwise><part id="P1"><measure number="1">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>16th</type>
        <beam number="1">begin</beam><beam number="2">begin</beam></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><type>16th</type>
        <beam number="1">continue</beam><beam number="2">end</beam></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>16th</type>
        <beam number="1">end</beam><beam number="2">backward hook</beam></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure></part></score-partwise>`;
    const beamed = parseMusicXML(xml);
    expect(beamed.notes.map((n) => n.beam)).toEqual(['begin', 'continue', 'end', undefined]);
  });
});
