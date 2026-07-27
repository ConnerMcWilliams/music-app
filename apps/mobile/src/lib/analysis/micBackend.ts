/**
 * Microphone backends for live analysis.
 *
 * The controller decides *what* the audio means; a backend decides *where it
 * comes from*. The `MicBackend` interface is the seam that keeps every native
 * audio call out of the analyser and React, and lets the capture engine be
 * swapped or stubbed — for tests, for web, or when the native module isn't in
 * the build. This mirrors `AudioBackend` in `lib/metronome/audioBackend.ts`.
 *
 * The default backend uses `react-native-audio-api`'s `AudioRecorder`, which is
 * the only API here that hands JS raw PCM *with a timestamp* — the timestamp is
 * what makes the audio alignable against the metronome at all. It also writes a
 * file from the same microphone session, so one run can both drive the live
 * overlay and produce a take that can be submitted for grading.
 *
 * ## Known limitation: the microphone hears the metronome — use headphones
 *
 * Analytical mode is tempo-locked, so the click is playing while we listen, and
 * on a device speaker it bleeds into the capture. The offbeat click (1108 Hz)
 * sits squarely inside the detector's 150–1250 Hz search range. The accent click
 * (1760 Hz) is *above* it, but that does not make it safe: an out-of-range tone
 * is not rejected, it folds onto a subharmonic inside the range (1760 → 880 or
 * 587 Hz), so it can still produce a confident, entirely spurious reading.
 *
 * Two things follow, and the player is told both (`AnalyticalModeControls`,
 * `docs/architecture.md`):
 *
 *  - clicks are short (35 ms ≈ 3 frames) and rarely match the expected pitch, so
 *    they show up as occasional **false verdicts on rests and quiet passages**
 *    rather than as systematic error;
 *  - **input latency is not corrected automatically.** The timeline offset is
 *    the fixed `DEFAULT_LATENCY_SECONDS`, so a high-latency device reads late.
 *    Anything that infers the player's entry from the audio infers it from the
 *    click instead, which is why that mechanism was removed rather than tuned
 *    (see the `liveAnalysis` module header).
 *
 * Unmitigated in v1 by choice — headphones are the answer; echo cancellation,
 * click-frequency filtering and click-window suppression were all considered and
 * are not worth their cost here yet.
 */
import { Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { AudioRecorder, FileDirectory, FileFormat } from 'react-native-audio-api';

import { monotonicNowSeconds } from '@/lib/metronome';
import { frameLengthFor, hopLengthFor } from '@/lib/pitch';
import type { MicTake } from './types';

/** Called with each complete analysis frame. */
export type FrameSink = (frame: Float32Array, when: number, sampleRate: number) => void;

export interface MicBackend {
  /** True when this backend captures nothing (fallback / tests / web). */
  readonly isSilent: boolean;
  /**
   * Acquire the microphone. Throws if permission is denied or audio can't
   * start — callers degrade to {@link SilentMicBackend} and surface an error.
   */
  prepare(): Promise<void>;
  /** Begin capture, delivering fixed-size frames to `onFrame`. */
  start(onFrame: FrameSink): Promise<void>;
  /** Stop capture. Resolves to the recorded take, or null if none is usable. */
  stop(): Promise<MicTake | null>;
  /** Monotonic seconds — the timebase the analyser aligns everything on. */
  now(): number;
  /** Release all audio resources. Safe to call more than once. */
  dispose(): Promise<void>;
}

/** Preferred capture format. The device may hand back something else. */
const PREFERRED_SAMPLE_RATE = 22_050;
/** Samples per delivered buffer. Small enough to keep latency low. */
const PREFERRED_BUFFER_LENGTH = 1024;

/** Cache subdirectory the recorder writes each run's take into. */
const TAKE_SUBDIRECTORY = 'live-takes';

/**
 * Delete every live take but the newest.
 *
 * A run records uncompressed WAV — roughly 5 MB a minute, about ten times what
 * the Record screen's m4a costs — and every Start/Stop leaves one behind,
 * including abandoned runs and runs that were never submitted. Nothing else in
 * the app removes them.
 *
 * The newest is kept: a take handed to the Record screen is only a URI by then,
 * so deleting it would pull the file out from under a submission the player is
 * part-way through. Running this on *prepare* — before the session that is
 * about to record has written anything — is what makes "newest" mean "the one
 * still in flight" rather than "the one being written right now".
 *
 * Best-effort by construction, and deliberately so: this is the OS-reclaimable
 * cache, and failing to tidy it must never stop someone starting a session. If
 * a platform ever put `react-native-audio-api`'s cache directory somewhere
 * other than the one `expo-file-system` reports, this finds nothing and the
 * takes stay reclaimable exactly as they are today.
 */
function pruneLiveTakes(): void {
  try {
    const directory = new Directory(Paths.cache, TAKE_SUBDIRECTORY);
    if (!directory.exists) return;

    const takes = directory.list().filter((entry): entry is File => entry instanceof File);
    if (takes.length <= 1) return;

    const newest = takes.reduce((a, b) =>
      (b.lastModified ?? 0) > (a.lastModified ?? 0) ? b : a,
    );
    for (const take of takes) {
      if (take.uri === newest.uri) continue;
      try {
        take.delete();
      } catch {
        // A file the OS still holds open is left for the cache sweep.
      }
    }
  } catch {
    // No directory yet, or no access to it — nothing to prune either way.
  }
}

/**
 * Reassembles the recorder's variable-length buffers into **overlapping**
 * analysis frames: a ~46 ms window advanced by a 10 ms hop.
 *
 * A ring buffer is not optional here: `onAudioReady` documents that `numFrames`
 * may differ from the requested `bufferLength`, and the detector needs an exact
 * frame length to line up with the backend's geometry. Each emitted frame
 * carries the timestamp of *its own first sample*, so timing stays honest across
 * ragged buffer sizes and dropped chunks.
 *
 * ## Why the frames overlap
 *
 * Advancing a whole frame at a time would be cheaper, and the timing cost would
 * be tolerable — but it wrecks *pitch* reliability on the actual repertoire.
 * Across the 169 bundled studies the note types are 8094 sixteenths, 4582
 * eighths, 56 quarters, 252 halves and 6 wholes: sixteenths are **62% of every
 * note in the catalogue**. At ♩=120 a sixteenth is 125 ms, so a non-overlapping
 * 46 ms frame yields barely two frames per note — one frame would decide the
 * verdict, and a 46 ms window over a 104 ms note (♩=144) overlaps its
 * neighbours by up to 44%, so autocorrelation sees two pitches at once and the
 * estimate smears.
 *
 * The 10 ms hop gives ~10 frames per sixteenth and matches the frame geometry in
 * `backend/grading/engine/analysis.py` exactly, which is also what lets live and
 * server verdicts be compared to each other.
 *
 * The emitted array is **reused** between frames — consumers must read it
 * synchronously and never retain it.
 */
export class FrameAssembler {
  private readonly ring: Float32Array;
  private readonly out: Float32Array;
  private writeIndex = 0;
  private filled = 0;
  private sinceEmit = 0;

  constructor(
    readonly frameLength: number,
    readonly hopLength: number,
  ) {
    this.ring = new Float32Array(frameLength);
    this.out = new Float32Array(frameLength);
  }

  /** Feed one delivered chunk. `emit` fires once per hop, after the first frame. */
  push(samples: Float32Array, when: number, sampleRate: number, emit: FrameSink): void {
    for (let i = 0; i < samples.length; i += 1) {
      this.ring[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.frameLength;
      if (this.filled < this.frameLength) this.filled += 1;
      this.sinceEmit += 1;

      if (this.filled < this.frameLength || this.sinceEmit < this.hopLength) continue;

      this.sinceEmit = 0;
      // The sample just written is the frame's newest; date the frame from its
      // oldest so `when` still means "the start of this window".
      const newestWhen = when + i / sampleRate;
      const frameWhen = newestWhen - (this.frameLength - 1) / sampleRate;
      this.linearize();
      emit(this.out, frameWhen, sampleRate);
    }
  }

  /** Copy the ring into a contiguous frame, oldest sample first. */
  private linearize(): void {
    // When the ring is full, the write cursor sits on the oldest sample.
    const oldest = this.writeIndex;
    const tail = this.frameLength - oldest;
    this.out.set(this.ring.subarray(oldest), 0);
    if (oldest > 0) this.out.set(this.ring.subarray(0, oldest), tail);
  }

  /** Drop all buffered audio (a new run). */
  reset(): void {
    this.writeIndex = 0;
    this.filled = 0;
    this.sinceEmit = 0;
  }
}

/**
 * `react-native-audio-api` backend. Requires a dev/native build — the same
 * constraint the metronome already carries.
 */
export class AudioApiMicBackend implements MicBackend {
  readonly isSilent = false;
  private recorder: AudioRecorder | null = null;
  private assembler: FrameAssembler | null = null;
  private assemblerRate = 0;
  private fileOutputEnabled = false;

  async prepare(): Promise<void> {
    if (this.recorder) return;

    // Capture runs through react-native-audio-api, but the OS permission is the
    // same one expo-audio asks for — so we reuse its API and the usage strings
    // its config plugin already installs. No app.json change, no prebuild.
    let permission = await getRecordingPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await requestRecordingPermissionsAsync();
    }
    if (!permission.granted) {
      throw new Error('Microphone permission denied');
    }

    // iOS needs the session put into a recording mode, and the metronome has to
    // stay audible while we listen.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    // Clear out earlier runs before this one starts writing (see pruneLiveTakes).
    pruneLiveTakes();

    const recorder = new AudioRecorder();
    // A file from the same session, so a practice run can be submitted for a
    // real grade without recording it twice.
    const enabled = recorder.enableFileOutput({
      format: FileFormat.Wav,
      directory: FileDirectory.Cache,
      subDirectory: TAKE_SUBDIRECTORY,
      fileNamePrefix: 'take',
      channelCount: 1,
    });
    this.fileOutputEnabled = enabled.status === 'success';

    this.recorder = recorder;
  }

  async start(onFrame: FrameSink): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) throw new Error('Microphone not prepared');

    this.assembler = null;
    this.assemblerRate = 0;
    recorder.onAudioReady(
      {
        sampleRate: PREFERRED_SAMPLE_RATE,
        bufferLength: PREFERRED_BUFFER_LENGTH,
        channelCount: 1,
      },
      (event) => {
        // Never assume the requested format was honoured — the API explicitly
        // allows the device to deliver a different rate and buffer size. The
        // frame length has to follow the *actual* rate, or frames stop being
        // ~46 ms long and the detector's low-frequency reach shrinks with them.
        const rate = event.buffer.sampleRate || PREFERRED_SAMPLE_RATE;
        if (!this.assembler || this.assemblerRate !== rate) {
          this.assembler = new FrameAssembler(frameLengthFor(rate), hopLengthFor(rate));
          this.assemblerRate = rate;
        }
        const channel = event.buffer.getChannelData(0);
        const frames = Math.min(event.numFrames, channel.length);
        this.assembler.push(channel.subarray(0, frames), event.when, rate, onFrame);
      },
    );

    const started = await recorder.start();
    if (started.status !== 'success') {
      throw new Error(started.message || 'Could not start the microphone');
    }
  }

  async stop(): Promise<MicTake | null> {
    const recorder = this.recorder;
    if (!recorder) return null;

    recorder.clearOnAudioReady();
    const result = await recorder.stop();
    if (result.status !== 'success' || !this.fileOutputEnabled) return null;

    // `paths` is an array because the recorder can rotate files mid-session.
    // A rotated take is a fragment, and uploading a fragment would be graded as
    // an incomplete performance — better to offer no take at all.
    if (result.paths.length !== 1) return null;

    return { uri: result.paths[0], durationSeconds: result.duration };
  }

  now(): number {
    return monotonicNowSeconds();
  }

  async dispose(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    this.assembler = null;
    if (!recorder) return;
    try {
      recorder.clearOnAudioReady();
      recorder.clearOnError();
      if (recorder.isRecording()) await recorder.stop();
    } catch {
      // Disposing a half-initialised recorder is fine.
    }
  }
}

/**
 * No-op backend. Keeps a valid monotonic clock so the playhead still advances
 * and the UI still works — there just isn't any audio to judge. Used on web, in
 * tests, and whenever the native module fails to initialise.
 */
export class SilentMicBackend implements MicBackend {
  readonly isSilent = true;
  async prepare(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<MicTake | null> {
    return null;
  }
  now(): number {
    return monotonicNowSeconds();
  }
  async dispose(): Promise<void> {}
}

/**
 * Default backend. Web has no `AudioRecorder` in this package, and CI builds the
 * web bundle, so the platform check is load-bearing rather than defensive.
 */
export function createMicBackend(): MicBackend {
  if (Platform.OS === 'web') return new SilentMicBackend();
  return new AudioApiMicBackend();
}
