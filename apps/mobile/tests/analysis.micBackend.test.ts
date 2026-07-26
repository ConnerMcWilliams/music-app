import { Platform } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { __reset, __setDirectory, deletedUris } from './mocks/expo-file-system';

import {
  AudioApiMicBackend,
  createMicBackend,
  FrameAssembler,
  SilentMicBackend,
} from '@/lib/analysis';
import { frameLengthFor, hopLengthFor } from '@/lib/pitch';

type Emitted = { samples: Float32Array; when: number; rate: number };

function collect(): [Emitted[], (s: Float32Array, w: number, r: number) => void] {
  const out: Emitted[] = [];
  // The assembler reuses its buffer between frames, so copy on the way out.
  return [out, (samples, when, rate) => out.push({ samples: Float32Array.from(samples), when, rate })];
}

/** A chunk whose samples are a known ramp, so ordering is verifiable. */
function ramp(from: number, count: number): Float32Array {
  return Float32Array.from({ length: count }, (_, i) => from + i);
}

describe('FrameAssembler', () => {
  const RATE = 22050;

  it('emits nothing until a whole window has arrived', () => {
    const assembler = new FrameAssembler(1024, 221);
    const [frames, sink] = collect();
    assembler.push(new Float32Array(700), 0, RATE, sink);
    expect(frames).toHaveLength(0);
  });

  /**
   * The recorder's `numFrames` is explicitly allowed to differ from the
   * requested buffer length, so the assembler has to bridge ragged chunks into
   * exact frames. This is the contract everything downstream depends on.
   */
  it('turns ragged chunks into exactly-sized frames', () => {
    const assembler = new FrameAssembler(1024, 221);
    const [frames, sink] = collect();

    assembler.push(ramp(0, 700), 0, RATE, sink);
    assembler.push(ramp(700, 1300), 700 / RATE, RATE, sink);

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.samples.length === 1024)).toBe(true);
  });

  /**
   * The window slides by one hop, it does not jump by a whole frame. Sixteenth
   * notes are 70% of the catalogue and last ~125 ms at ♩=120, so a whole-frame
   * hop would leave ~2 frames to judge each of them.
   */
  it('slides the window by one hop, overlapping consecutive frames', () => {
    const assembler = new FrameAssembler(8, 2);
    const [frames, sink] = collect();

    assembler.push(ramp(0, 14), 0, RATE, sink);

    // First window is samples 0-7, then it advances two at a time.
    expect(Array.from(frames[0].samples)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Array.from(frames[1].samples)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(frames[2].samples)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(Array.from(frames[3].samples)).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('emits one frame per hop once running', () => {
    const assembler = new FrameAssembler(1024, 221);
    const [frames, sink] = collect();

    // One second of audio at a 10 ms hop is ~100 frames, minus the first
    // window's worth of warm-up.
    assembler.push(new Float32Array(RATE), 0, RATE, sink);
    expect(frames.length).toBe(Math.floor((RATE - 1024) / 221) + 1);
  });

  it('keeps samples contiguous across a chunk boundary', () => {
    const assembler = new FrameAssembler(8, 8);
    const [frames, sink] = collect();

    assembler.push(ramp(0, 5), 0, RATE, sink);
    assembler.push(ramp(5, 11), 5 / RATE, RATE, sink);

    expect(Array.from(frames[0].samples)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Array.from(frames[1].samples)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('dates each frame from its own oldest sample', () => {
    const assembler = new FrameAssembler(8, 4);
    const [frames, sink] = collect();

    assembler.push(ramp(0, 24), 10, RATE, sink);

    // Window 0 covers samples 0-7, so it starts at the chunk's own `when`.
    expect(frames[0].when).toBeCloseTo(10, 9);
    // Each subsequent window starts one hop later.
    expect(frames[1].when).toBeCloseTo(10 + 4 / RATE, 9);
    expect(frames[2].when).toBeCloseTo(10 + 8 / RATE, 9);
  });

  it('keeps timestamps monotone and hop-spaced across ragged chunks', () => {
    const assembler = new FrameAssembler(64, 16);
    const [frames, sink] = collect();

    let when = 0;
    for (const size of [100, 33, 250, 7, 512]) {
      assembler.push(ramp(0, size), when, RATE, sink);
      when += size / RATE;
    }

    expect(frames.length).toBeGreaterThan(3);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i].when).toBeGreaterThan(frames[i - 1].when);
      expect(frames[i].when - frames[i - 1].when).toBeCloseTo(16 / RATE, 9);
    }
  });

  it('reports the sample rate it was given', () => {
    const assembler = new FrameAssembler(4, 4);
    const [frames, sink] = collect();
    assembler.push(ramp(0, 4), 0, 48000, sink);
    expect(frames[0].rate).toBe(48000);
  });

  it('drops buffered audio on reset', () => {
    const assembler = new FrameAssembler(8, 8);
    const [frames, sink] = collect();
    assembler.push(ramp(0, 5), 0, RATE, sink);
    assembler.reset();
    assembler.push(ramp(100, 8), 1, RATE, sink);
    expect(frames).toHaveLength(1);
    expect(frames[0].samples[0]).toBe(100);
  });
});

describe('createMicBackend', () => {
  const original = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = original;
  });

  it('captures audio on a device', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(createMicBackend()).toBeInstanceOf(AudioApiMicBackend);
  });

  /** CI builds the web bundle, so this fallback is load-bearing, not defensive. */
  it('stays silent on web, where there is no recorder', () => {
    (Platform as { OS: string }).OS = 'web';
    expect(createMicBackend()).toBeInstanceOf(SilentMicBackend);
  });
});

describe('SilentMicBackend', () => {
  it('satisfies the contract without any audio', async () => {
    const backend = new SilentMicBackend();
    expect(backend.isSilent).toBe(true);
    await backend.prepare();
    await backend.start();
    expect(await backend.stop()).toBeNull();
    expect(backend.now()).toBeGreaterThan(0);
    await backend.dispose();
  });
});

/** Reach the recorder the backend created so its mock emitter can be driven. */
type Recorder = {
  eventEmitter: { emit: (event: string, data: unknown) => void };
  stop: () => Promise<unknown>;
};
const recorderOf = (backend: AudioApiMicBackend) =>
  (backend as unknown as { recorder: Recorder }).recorder;

function audioReadyEvent(samples: Float32Array, when: number, sampleRate: number) {
  return {
    buffer: { sampleRate, getChannelData: () => samples },
    numFrames: samples.length,
    when,
  };
}

describe('AudioApiMicBackend', () => {
  it('refuses to start without microphone permission', async () => {
    (getRecordingPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
      expires: 'never',
    });
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: 'denied',
      expires: 'never',
    });

    await expect(new AudioApiMicBackend().prepare()).rejects.toThrow(/permission/i);
  });

  it('delivers assembled frames from the recorder', async () => {
    const backend = new AudioApiMicBackend();
    await backend.prepare();
    const [frames, sink] = collect();
    await backend.start(sink);

    const rate = 22050;
    const frameLength = frameLengthFor(rate);
    const recorder = recorderOf(backend);
    // Two ragged buffers that together exceed one analysis window.
    recorder.eventEmitter.emit('audioReady', audioReadyEvent(ramp(0, 700), 0, rate));
    recorder.eventEmitter.emit(
      'audioReady',
      audioReadyEvent(ramp(700, 700), 700 / rate, rate),
    );

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.samples.length === frameLength)).toBe(true);
    expect(frames[0].rate).toBe(rate);
    await backend.dispose();
  });

  /**
   * The device may hand back a rate we didn't ask for. Frames must follow it, or
   * they stop being ~46 ms long and the detector's low-frequency reach shrinks.
   */
  it('sizes frames from the rate the device actually delivered', async () => {
    const backend = new AudioApiMicBackend();
    await backend.prepare();
    const [frames, sink] = collect();
    await backend.start(sink);

    const rate = 48000;
    recorderOf(backend).eventEmitter.emit(
      'audioReady',
      audioReadyEvent(ramp(0, frameLengthFor(rate) + hopLengthFor(rate) + 10), 0, rate),
    );

    expect(frames[0].samples).toHaveLength(frameLengthFor(rate));
    expect(frames[0].samples).not.toHaveLength(frameLengthFor(22050));
    // And it hops at that rate too, not the one we asked for.
    expect(frames[1].when - frames[0].when).toBeCloseTo(hopLengthFor(rate) / rate, 9);
    await backend.dispose();
  });

  it('returns the recorded take when the session produced one file', async () => {
    const backend = new AudioApiMicBackend();
    await backend.prepare();
    await backend.start(() => {});
    expect(await backend.stop()).toEqual({
      uri: '/mock/path/recording.m4a',
      durationSeconds: 5,
    });
    await backend.dispose();
  });

  /**
   * `FileInfo.paths` is an array because the recorder can rotate files. A
   * rotated take is a fragment, and grading a fragment would report an
   * incomplete performance — so offer no take at all rather than a wrong one.
   */
  it('offers no take when the recording was split across files', async () => {
    const backend = new AudioApiMicBackend();
    await backend.prepare();
    await backend.start(() => {});

    const recorder = recorderOf(backend);
    recorder.stop = async () => ({
      status: 'success',
      paths: ['/mock/a.wav', '/mock/b.wav'],
      size: 1,
      duration: 5,
    });

    expect(await backend.stop()).toBeNull();
    await backend.dispose();
  });

  it('is safe to dispose more than once', async () => {
    const backend = new AudioApiMicBackend();
    await backend.prepare();
    await backend.dispose();
    await expect(backend.dispose()).resolves.toBeUndefined();
  });
});

/**
 * Each run writes an uncompressed WAV (~5 MB a minute, ~10× the m4a the Record
 * screen produces) and nothing else in the app ever removes them.
 */
describe('live-take cache', () => {
  const CACHE = 'file:///cache/live-takes';

  beforeEach(() => {
    __reset();
  });

  it('keeps only the newest take when preparing the next run', async () => {
    __setDirectory(CACHE, [
      { name: 'take_1.wav', lastModified: 1_000 },
      { name: 'take_3.wav', lastModified: 3_000 },
      { name: 'take_2.wav', lastModified: 2_000 },
    ]);

    await new AudioApiMicBackend().prepare();

    // The newest survives: a take handed to the Record screen is only a URI by
    // then, so deleting it would break a submission already in flight.
    expect(deletedUris.sort()).toEqual([`${CACHE}/take_1.wav`, `${CACHE}/take_2.wav`]);
  });

  it('leaves a lone take alone', async () => {
    __setDirectory(CACHE, [{ name: 'take_1.wav', lastModified: 1_000 }]);
    await new AudioApiMicBackend().prepare();
    expect(deletedUris).toEqual([]);
  });

  /** Tidying the cache is never worth failing to start a practice session. */
  it('still starts a session when the cache cannot be read', async () => {
    await expect(new AudioApiMicBackend().prepare()).resolves.toBeUndefined();
    expect(deletedUris).toEqual([]);
  });
});
