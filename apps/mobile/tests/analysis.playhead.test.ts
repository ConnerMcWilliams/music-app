import { buildWindows, Playhead } from '@/lib/analysis';
import type { ExpectedNote } from '@/lib/musicxml';

const BPM = 120; // one beat = 0.5 s

/** Four quarter notes: windows ≈ [-0.09,0.48) [0.48,0.98) [0.98,1.48) [1.48,1.98) */
const TIMELINE: ExpectedNote[] = [0, 1, 2, 3].map((i) => ({
  index: i,
  noteIndex: i * 2, // deliberately not equal to `index`, as rests would cause
  midi: 60 + i,
  onsetBeats: i,
  durationBeats: 1,
  measureIndex: 0,
}));

const windows = () => buildWindows(TIMELINE, BPM);

describe('Playhead.windowAt', () => {
  it('finds the note owning an instant', () => {
    const playhead = new Playhead(windows());
    expect(playhead.windowAt(0)?.index).toBe(0);
    expect(playhead.windowAt(0.3)?.index).toBe(0);
    expect(playhead.windowAt(0.6)?.index).toBe(1);
    expect(playhead.windowAt(1.9)?.index).toBe(3);
  });

  it('returns nothing before the first note or past the last', () => {
    const playhead = new Playhead(windows());
    expect(playhead.windowAt(-5)).toBeUndefined();
    expect(playhead.windowAt(99)).toBeUndefined();
  });

  it('routes a frame to exactly one note', () => {
    const playhead = new Playhead(windows());
    const all = windows();
    for (let t = -0.2; t < 2.2; t += 0.007) {
      const owners = all.filter((w) => t >= w.start && t < w.end);
      expect(owners.length).toBeLessThanOrEqual(1);
      expect(playhead.windowAt(t)?.index).toBe(owners[0]?.index);
    }
  });
});

describe('Playhead.advanceTo', () => {
  it('reports each window once, in order, as it closes', () => {
    const playhead = new Playhead(windows());
    expect(playhead.advanceTo(0.2)).toEqual([]);
    expect(playhead.advanceTo(0.5).map((w) => w.index)).toEqual([0]);
    // Already-reported windows are never reported again.
    expect(playhead.advanceTo(0.5)).toEqual([]);
    expect(playhead.advanceTo(1.5).map((w) => w.index)).toEqual([1, 2]);
    expect(playhead.advanceTo(99).map((w) => w.index)).toEqual([3]);
  });

  it('closes everything at once when time jumps past the end', () => {
    const playhead = new Playhead(windows());
    expect(playhead.advanceTo(99).map((w) => w.index)).toEqual([0, 1, 2, 3]);
    expect(playhead.isFinished).toBe(true);
  });

  it('is not finished until the last window closes', () => {
    const playhead = new Playhead(windows());
    playhead.advanceTo(1.5);
    expect(playhead.isFinished).toBe(false);
    playhead.advanceTo(2.0);
    expect(playhead.isFinished).toBe(true);
  });
});

describe('Playhead.activeAt', () => {
  it('reports the note being played', () => {
    const playhead = new Playhead(windows());
    expect(playhead.activeAt(0.2)?.noteIndex).toBe(0);
    expect(playhead.activeAt(0.6)?.noteIndex).toBe(2);
  });

  it('leads into the next note during a gap', () => {
    const gapped = buildWindows(
      [
        { index: 0, noteIndex: 0, midi: 60, onsetBeats: 0, durationBeats: 1, measureIndex: 0 },
        { index: 1, noteIndex: 1, midi: 62, onsetBeats: 4, durationBeats: 1, measureIndex: 0 },
      ],
      BPM,
    );
    const playhead = new Playhead(gapped);
    // Well inside the rest between the two notes.
    expect(playhead.windowAt(1.2)).toBeUndefined();
    expect(playhead.activeAt(1.2)?.noteIndex).toBe(1);
  });

  it('reports nothing once the study is over', () => {
    const playhead = new Playhead(windows());
    expect(playhead.activeAt(99)).toBeUndefined();
  });

  it('advances monotonically through a run', () => {
    const playhead = new Playhead(windows());
    let previous = -1;
    for (let t = -0.1; t < 2.0; t += 0.01) {
      const active = playhead.activeAt(t);
      if (!active) continue;
      expect(active.index).toBeGreaterThanOrEqual(previous);
      previous = active.index;
    }
  });
});

describe('Playhead.reAnchor', () => {
  it('rewinds the cursor and reports the notes to un-judge', () => {
    const playhead = new Playhead(windows());
    playhead.advanceTo(1.5); // closes 0, 1, 2

    const unjudged = playhead.reAnchor(0.2);
    expect(unjudged.map((w) => w.index)).toEqual([0, 1, 2]);
    // Those windows can close again after the shift.
    expect(playhead.advanceTo(1.0).map((w) => w.index)).toEqual([0, 1]);
  });

  it('only rewinds as far as the corrected time', () => {
    const playhead = new Playhead(windows());
    playhead.advanceTo(1.5); // closes 0, 1, 2
    const unjudged = playhead.reAnchor(0.6); // note 1 is still open at 0.6
    expect(unjudged.map((w) => w.index)).toEqual([1, 2]);
  });

  it('is a no-op when the correction changes nothing', () => {
    const playhead = new Playhead(windows());
    playhead.advanceTo(0.5);
    expect(playhead.reAnchor(0.5)).toEqual([]);
  });
});

describe('Playhead bounds', () => {
  it('handles an empty timeline', () => {
    const playhead = new Playhead([]);
    expect(playhead.length).toBe(0);
    expect(playhead.isFinished).toBe(true);
    expect(playhead.endTime).toBe(0);
    expect(playhead.advanceTo(1)).toEqual([]);
    expect(playhead.activeAt(1)).toBeUndefined();
  });

  it('exposes when judging ends', () => {
    expect(new Playhead(windows()).endTime).toBeCloseTo(1.98, 6);
  });
});
