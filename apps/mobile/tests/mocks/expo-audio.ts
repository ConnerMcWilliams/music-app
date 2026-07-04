/**
 * Manual Jest mock for `expo-audio` (mapped via jest.config.js) — the recorder
 * is native-only and has no JS runtime under Jest, mirroring the existing
 * react-native-audio-api mapping. Only the surface the app uses is mocked.
 */
export const RecordingPresets = {
  HIGH_QUALITY: {},
  LOW_QUALITY: {},
};

const GRANTED = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

export const requestRecordingPermissionsAsync = jest.fn(async () => GRANTED);

export const getRecordingPermissionsAsync = jest.fn(async () => GRANTED);

export const setAudioModeAsync = jest.fn(async () => {});

/** Shared inert recorder so tests can assert against `mockRecorder.record` etc. */
export const mockRecorder = {
  id: 'mock-recorder',
  uri: 'file:///mock/take.m4a',
  currentTime: 0,
  isRecording: false,
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  stop: jest.fn(async () => {}),
};

export const useAudioRecorder = jest.fn(() => mockRecorder);

export const useAudioRecorderState = jest.fn(() => ({
  canRecord: true,
  isRecording: false,
  durationMillis: 0,
  url: null,
}));
