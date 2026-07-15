import { render, userEvent, waitFor } from '@testing-library/react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';

import RecordScreen from '@/app/record';
import { submitTakeForGrading } from '@/services/api';
import { ApiError } from '@/services/apiError';
import { AuthError, NetworkError } from '@/services/auth';
import { getLastGradingResult, setLastGradingResult } from '@/services/lastGradingResult';
import type { GradingResult } from '@/types';

// expo-audio and expo-document-picker resolve to tests/mocks/* via jest.config.js.

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/services/api', () => ({
  submitTakeForGrading: jest.fn(),
}));

const mockSubmit = submitTakeForGrading as jest.Mock;
const mockGetPermission = getRecordingPermissionsAsync as jest.Mock;
const mockRequestPermission = requestRecordingPermissionsAsync as jest.Mock;
const GRANTED = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

/** Press via userEvent so the async handler (permissions, recorder, fetch) is act-wrapped. */
async function pressAsync(element: Parameters<typeof userEvent.press>[0]) {
  await userEvent.press(element);
}

const GRADE: GradingResult = {
  submissionId: 'sub-123',
  exerciseId: 'clarke-2',
  exerciseTitle: 'Clarke Study No. 2',
  totalScore: 88,
  gradeLabel: 'A−',
  categories: [{ label: 'Intonation', score: 92 }],
  feedbackAuthor: 'Prof. Halvorsen',
  feedbackInitials: 'PH',
  feedbackText: 'Nice legato.',
};

describe('Record screen flow', () => {
  beforeEach(() => {
    setLastGradingResult(null);
    mockSubmit.mockResolvedValue(GRADE);
    mockGetPermission.mockResolvedValue(GRANTED);
    mockRequestPermission.mockResolvedValue(GRANTED);
  });

  it('records, stops, submits, and lands on Results with the grade', async () => {
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());

    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/results'));

    // No params → the defensive fallback, the catalog's first study; the take
    // comes from the recorder.
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///mock/take.m4a',
        exerciseId: 'clarke-1-1',
        exerciseTitle: 'Clarke Study No. 1',
      }),
    );
    expect(getLastGradingResult()).toEqual(GRADE);
  });

  it('Retry discards the take and returns to the idle recorder', async () => {
    const { getByLabelText, getByText, queryByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Retry'));
    await waitFor(() => expect(getByText('Tap to record live')).toBeTruthy());
    expect(queryByText('Ready to submit')).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('Upload audio feeds a picked file through the same submit flow', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/solo.mp3', name: 'solo.mp3', mimeType: 'audio/mpeg' }],
    });
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Upload audio'));
    await waitFor(() => expect(getByText('solo.mp3')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/results'));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///picked/solo.mp3',
        fileName: 'solo.mp3',
        mimeType: 'audio/mpeg',
      }),
    );
    expect(getLastGradingResult()).toEqual(GRADE);
  });

  it('a network failure keeps the take reviewable and says the backend is unreachable', async () => {
    mockSubmit.mockRejectedValue(new NetworkError());
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() =>
      expect(
        getByText(
          'Couldn’t reach the grading service. Is the backend running and reachable from this device?',
        ),
      ).toBeTruthy(),
    );
    // Still in review — the user can retry the submission.
    expect(getByText('Submit')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(getLastGradingResult()).toBeNull();
  });

  it('a backend rejection surfaces the server’s own reason', async () => {
    mockSubmit.mockRejectedValue(new ApiError('Audio file is too large (max 30 MB).', 400));
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() =>
      expect(getByText('Audio file is too large (max 30 MB).')).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('an expired session tells the user to sign in again', async () => {
    mockSubmit.mockRejectedValue(
      new AuthError('Your session has expired. Please sign in again.', { sessionInvalid: true }),
    );
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() =>
      expect(getByText('Your session has expired. Please sign in again.')).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('prompts for the mic only when not yet granted', async () => {
    mockGetPermission.mockResolvedValue({ ...GRANTED, granted: false });
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    // Already-checked state was "not granted, can ask" → OS dialog shown once.
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('does not prompt when granted, and records straight away', async () => {
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    // Permission already granted → no dialog.
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('shows a Settings shortcut when the mic is permanently blocked', async () => {
    // Denied with "don't ask again": requesting again would resolve silently.
    mockGetPermission.mockResolvedValue({ ...GRANTED, granted: false, canAskAgain: false });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { getByLabelText, getByText, queryByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() =>
      expect(
        getByText('Microphone access is blocked. Enable it in Settings, then try again.'),
      ).toBeTruthy(),
    );
    // No pointless dialog, and no recording started.
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(queryByText('Recording — tap to stop')).toBeNull();

    await pressAsync(getByLabelText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });
});
