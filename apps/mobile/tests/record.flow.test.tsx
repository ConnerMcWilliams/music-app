import { render, userEvent, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import RecordScreen from '@/app/record';
import { submitTakeForGrading } from '@/services/api';
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
  });

  it('records, stops, submits, and lands on Results with the grade', async () => {
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());

    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/results'));

    // No params → today's study (Clarke No. 2); the take comes from the recorder.
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///mock/take.m4a',
        exerciseId: 'clarke-2',
        exerciseTitle: 'Clarke Study No. 2',
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

  it('a failed submission keeps the take reviewable and shows an error', async () => {
    mockSubmit.mockRejectedValue(new Error('network down'));
    const { getByLabelText, getByText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Record live'));
    await waitFor(() => expect(getByText('Recording — tap to stop')).toBeTruthy());
    await pressAsync(getByLabelText('Stop recording'));
    await waitFor(() => expect(getByText('Ready to submit')).toBeTruthy());

    await pressAsync(getByLabelText('Submit for grading'));
    await waitFor(() =>
      expect(getByText('Couldn’t reach the grading service. Is the backend running?')).toBeTruthy(),
    );
    // Still in review — the user can retry the submission.
    expect(getByText('Submit')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(getLastGradingResult()).toBeNull();
  });
});
