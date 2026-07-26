import { render, userEvent, waitFor } from '@testing-library/react-native';
import { getRecordingPermissionsAsync } from 'expo-audio';

import RecordScreen from '@/app/record';
import { submitTakeForGrading } from '@/services/api';
import { setLastGradingResult } from '@/services/lastGradingResult';
import type { GradingResult } from '@/types';

/**
 * The hand-off from analytical mode to Record.
 *
 * Live mode records the same session it judges, so a player who liked their run
 * can grade *that* run rather than playing it again. Practice pushes `/record`
 * with the take's uri/duration and this screen opens straight in review.
 */

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services/api', () => ({
  submitTakeForGrading: jest.fn(),
}));

const mockSubmit = submitTakeForGrading as jest.Mock;
const mockGetPermission = getRecordingPermissionsAsync as jest.Mock;
const GRANTED = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

const GRADE: GradingResult = {
  submissionId: 'sub-1',
  exerciseId: 'clarke-2-5',
  exerciseTitle: 'Clarke Study No. 5',
  totalScore: 88,
  gradeLabel: 'A−',
  categories: [{ label: 'Pitch Accuracy', score: 92 }],
  feedbackAuthor: 'Prof. Halvorsen',
  feedbackInitials: 'PH',
  feedbackText: 'Nice legato.',
};

const LIVE_URI = 'file:///cache/live-takes/take-1.wav';

async function pressAsync(element: Parameters<typeof userEvent.press>[0]) {
  await userEvent.press(element);
}

describe('Record screen — analytical-mode hand-off', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockClear();
    setLastGradingResult(null);
    mockSubmit.mockResolvedValue(GRADE);
    mockGetPermission.mockResolvedValue(GRANTED);
  });

  it('opens straight in review when handed a take', async () => {
    mockParams = { exerciseId: 'clarke-2-5', takeUri: LIVE_URI, takeDuration: '31.5' };
    const { getByText, getByLabelText } = await render(<RecordScreen />);

    // Named so arriving with audio already loaded isn't disorienting.
    expect(getByText('REVIEW YOUR ANALYTICAL TAKE')).toBeTruthy();
    expect(getByLabelText('Submit for grading')).toBeTruthy();
  });

  it('submits the live WAV with its duration and the resolved study slug', async () => {
    mockParams = { exerciseId: 'clarke-2-5', takeUri: LIVE_URI, takeDuration: '31.5' };
    const { getByLabelText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Submit for grading'));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: LIVE_URI,
        // WAV, not the recorder's default m4a — live mode writes WAV, and the
        // wrong mime would fail the backend's extension allowlist.
        mimeType: 'audio/wav',
        durationSeconds: 31.5,
        exerciseId: 'clarke-2-5',
      }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/results'));
  });

  it('falls back to the normal record flow without a take', async () => {
    mockParams = { exerciseId: 'clarke-2-5' };
    const { getByText, getByLabelText } = await render(<RecordScreen />);

    expect(getByText('RECORD A TAKE')).toBeTruthy();
    expect(getByLabelText('Record live')).toBeTruthy();
  });

  it('ignores a malformed hand-off rather than reviewing an unusable take', async () => {
    // An empty uri would put the screen in review over audio that can't upload.
    mockParams = { exerciseId: 'clarke-2-5', takeUri: '', takeDuration: 'nonsense' };
    const { getByText } = await render(<RecordScreen />);
    expect(getByText('RECORD A TAKE')).toBeTruthy();
  });

  it('submits without a duration when the hand-off carries a bad one', async () => {
    mockParams = { exerciseId: 'clarke-2-5', takeUri: LIVE_URI, takeDuration: 'NaN' };
    const { getByLabelText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Submit for grading'));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit.mock.calls[0][0].durationSeconds).toBeUndefined();
    expect(mockSubmit.mock.calls[0][0].uri).toBe(LIVE_URI);
  });

  /**
   * "Retry" must discard the handed-over take. Re-deriving review from the
   * router param would snap straight back to the take just rejected.
   */
  it('returns to idle on retry instead of restoring the handed-over take', async () => {
    mockParams = { exerciseId: 'clarke-2-5', takeUri: LIVE_URI, takeDuration: '31.5' };
    const { getByText, getByLabelText, queryByLabelText } = await render(<RecordScreen />);

    await pressAsync(getByLabelText('Retry'));

    await waitFor(() => expect(getByText('RECORD A TAKE')).toBeTruthy());
    expect(queryByLabelText('Submit for grading')).toBeNull();
    expect(getByLabelText('Record live')).toBeTruthy();
  });
});
