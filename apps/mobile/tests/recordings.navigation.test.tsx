import { fireEvent, render, userEvent, waitFor, within } from '@testing-library/react-native';

import RecordingsScreen from '@/app/recordings';
import { useAuth } from '@/context/AuthContext';
import { authClient } from '@/services/auth';
import { getLastGradingResult, setLastGradingResult } from '@/services/lastGradingResult';

// The "All recordings" screen (See all → /recordings) pages through the user's
// real submission history from GET /api/submissions/?page=N, reusing the same
// service/mapping as the Profile list. This test drives the real screen against
// the snake_case wire body, so services/submissions.ts runs end to end.

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: () => false,
  },
}));

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/services/auth', () => ({ authClient: { authedRequest: jest.fn() } }));

const mockUseAuth = useAuth as jest.Mock;
const mockAuthedRequest = authClient.authedRequest as jest.Mock;

function gradeFor(title: string) {
  return {
    total_score: 84,
    grade_label: 'B',
    categories: [{ label: 'Pitch Accuracy', score: 95 }],
    feedback_author: 'Prof. Halvorsen',
    feedback_initials: 'PH',
    feedback_text: `Strong ${title}.`,
  };
}

// Page 1: two graded takes from different studies, with a next page.
const PAGE1 = {
  count: 3,
  next: 'http://testserver/api/submissions/?page=2',
  previous: null,
  results: [
    {
      submission_id: 's-fifth',
      exercise_id: 'clarke-5',
      exercise_title: 'Fifth Study',
      created_at: '2026-07-08T01:46:26.337689Z',
      duration_seconds: 63.0, // → "1:03"
      audio_url: 'http://testserver/media/s-fifth/take.wav',
      grade: gradeFor('Fifth Study'),
    },
    {
      submission_id: 's-second',
      exercise_id: 'clarke-2',
      exercise_title: 'Second Study',
      created_at: '2026-07-08T01:46:26.268699Z',
      duration_seconds: 48.0, // → "0:48"
      audio_url: 'http://testserver/media/s-second/take.wav',
      grade: gradeFor('Second Study'),
    },
  ],
};

// Page 2: one more take, no further pages.
const PAGE2 = {
  count: 3,
  next: null,
  previous: 'http://testserver/api/submissions/?page=1',
  results: [
    {
      submission_id: 's-third',
      exercise_id: 'clarke-3',
      exercise_title: 'Third Study',
      created_at: '2026-07-07T01:46:26.268699Z',
      duration_seconds: 90.0, // → "1:30"
      audio_url: 'http://testserver/media/s-third/take.wav',
      grade: gradeFor('Third Study'),
    },
  ],
};

const AUTH_USER = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice Adams',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('All recordings screen — paged history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLastGradingResult(null);
    mockUseAuth.mockReturnValue({ user: AUTH_USER });
    mockAuthedRequest.mockImplementation((url: string) => {
      if (url === '/api/submissions/?page=1') return Promise.resolve({ ok: true, json: async () => PAGE1 });
      if (url === '/api/submissions/?page=2') return Promise.resolve({ ok: true, json: async () => PAGE2 });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  });

  it('loads and lists the first page of recordings', async () => {
    const { getByText } = await render(<RecordingsScreen />);

    await waitFor(() =>
      expect(mockAuthedRequest).toHaveBeenCalledWith('/api/submissions/?page=1', { method: 'GET' }),
    );
    await waitFor(() => expect(getByText(/1:03/)).toBeTruthy()); // Fifth Study card
    expect(getByText(/0:48/)).toBeTruthy(); // Second Study card
  });

  it('tapping a take hands its own grade to Results and navigates', async () => {
    const { getByText } = await render(<RecordingsScreen />);
    await waitFor(() => expect(getByText(/0:48/)).toBeTruthy());

    // Press the Second Study card (its unique duration identifies the row).
    fireEvent.press(getByText(/0:48/));

    const handed = getLastGradingResult();
    expect(handed?.exerciseTitle).toBe('Second Study');
    expect(handed?.audioUrl).toBe('http://testserver/media/s-second/take.wav');
    expect(mockPush).toHaveBeenCalledWith('/results');
  });

  it('Next pages forward and Previous pages back', async () => {
    const { getByText, queryByText } = await render(<RecordingsScreen />);
    await waitFor(() => expect(getByText(/1:03/)).toBeTruthy());

    fireEvent.press(getByText('Next'));

    await waitFor(() =>
      expect(mockAuthedRequest).toHaveBeenCalledWith('/api/submissions/?page=2', { method: 'GET' }),
    );
    await waitFor(() => expect(getByText(/1:30/)).toBeTruthy()); // Third Study (page 2)
    expect(getByText('Page 2')).toBeTruthy();
    expect(queryByText(/1:03/)).toBeNull(); // page 1 rows gone

    fireEvent.press(getByText('Previous'));
    await waitFor(() => expect(getByText(/1:03/)).toBeTruthy());
    expect(getByText('Page 1')).toBeTruthy();
  });

  it('a study chip filters the current page to that study', async () => {
    const user = userEvent.setup();
    const { getByTestId, getByText, queryByText } = await render(<RecordingsScreen />);
    await waitFor(() => expect(getByText(/1:03/)).toBeTruthy());

    // Press the chip (not the same-named card) via the filters container. Chips
    // are driven through the press gesture, so use userEvent, not fireEvent.
    await user.press(within(getByTestId('recording-filters')).getByText('Second Study'));

    // Only the Second Study card remains; the Fifth Study card (1:03) is gone.
    expect(getByText(/0:48/)).toBeTruthy();
    expect(queryByText(/1:03/)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
