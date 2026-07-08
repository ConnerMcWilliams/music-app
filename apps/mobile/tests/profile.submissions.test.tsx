import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useAuth } from '@/context/AuthContext';
import { authClient } from '@/services/auth';
import { getLastGradingResult, setLastGradingResult } from '@/services/lastGradingResult';

// The Profile "Recent recordings" list now shows the signed-in user's real
// submissions from GET /api/submissions/ (was a static mock). This test drives
// the actual ProfileScreen against the exact snake_case wire body the backend
// returns, so the real service mapping (services/submissions.ts) runs end to end.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

// Identity/streak come from a separate source; stub it so this test is about
// submissions only. useProfile reads these two exports.
jest.mock('@/services/profile', () => ({
  fetchProfileStats: jest.fn().mockResolvedValue({
    dayStreak: 0,
    personalBest: 0,
    studiesDone: 0,
    avgScore: 0,
  }),
  EMPTY_PROFILE_STATS: { dayStreak: 0, personalBest: 0, studiesDone: 0, avgScore: 0 },
}));

// Mock only the transport; the real fetchSubmissions()/mapSubmission() run.
jest.mock('@/services/auth', () => ({
  authClient: { authedRequest: jest.fn() },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockAuthedRequest = authClient.authedRequest as jest.Mock;

// Verbatim GET /api/submissions/ response captured from the live backend:
// newest-first, one graded row per take plus one ungraded (grade: null) row.
const WIRE = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      submission_id: '679ac2e9-2c55-4688-821c-12346bfa27e7',
      exercise_id: 'clarke-7',
      exercise_title: 'Pending take',
      created_at: '2026-07-08T01:46:26.361679Z',
      duration_seconds: 30.0,
      audio_url: null,
      grade: null,
    },
    {
      submission_id: '142a62dd-9a2e-4469-a977-d0fbfb609683',
      exercise_id: 'clarke-5',
      exercise_title: 'Fifth Study',
      created_at: '2026-07-08T01:46:26.337689Z',
      duration_seconds: 63.0,
      audio_url: 'http://testserver/media/submissions/142a62dd-9a2e-4469-a977-d0fbfb609683/take.wav',
      grade: {
        total_score: 84,
        grade_label: 'B',
        categories: [
          { label: 'Pitch Accuracy', score: 95 },
          { label: 'Rhythm', score: 99 },
          { label: 'Tempo Consistency', score: 98 },
          { label: 'Tone Stability', score: 77 },
          { label: 'Completion', score: 29 },
        ],
        feedback_author: 'Prof. Halvorsen',
        feedback_initials: 'PH',
        feedback_text: 'Strong playing overall.',
      },
    },
    {
      submission_id: '869d0792-5e97-431c-a735-6c5bcc1c59a0',
      exercise_id: 'clarke-2',
      exercise_title: 'Second Study',
      created_at: '2026-07-08T01:46:26.268699Z',
      duration_seconds: 48.2,
      audio_url: 'http://testserver/media/submissions/869d0792-5e97-431c-a735-6c5bcc1c59a0/take.wav',
      grade: {
        total_score: 84,
        grade_label: 'B',
        categories: [
          { label: 'Pitch Accuracy', score: 95 },
          { label: 'Rhythm', score: 99 },
          { label: 'Tempo Consistency', score: 98 },
          { label: 'Tone Stability', score: 77 },
          { label: 'Completion', score: 29 },
        ],
        feedback_author: 'Prof. Halvorsen',
        feedback_initials: 'PH',
        feedback_text: 'Strong playing overall.',
      },
    },
  ],
};

const AUTH_USER = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice Adams',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('Profile "Recent recordings" — real submissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLastGradingResult(null);
    mockUseAuth.mockReturnValue({ user: AUTH_USER });
    mockAuthedRequest.mockResolvedValue({ ok: true, json: async () => WIRE });
  });

  it('renders the signed-in user\'s real takes from the backend', async () => {
    const { getByText } = await render(<ProfileScreen />);

    // Hit the authenticated history endpoint, not the mock.
    await waitFor(() =>
      expect(mockAuthedRequest).toHaveBeenCalledWith('/api/submissions/?page=1', {
        method: 'GET',
      }),
    );

    // Real rows render with backend titles and client-formatted date · duration.
    await waitFor(() => expect(getByText('Second Study')).toBeTruthy());
    expect(getByText('Fifth Study')).toBeTruthy();
    expect(getByText('Pending take')).toBeTruthy();
    // 63s → "1:03", 48.2s → "0:48" (formatDuration in services/submissions.ts).
    expect(getByText(/1:03/)).toBeTruthy();
    expect(getByText(/0:48/)).toBeTruthy();
  });

  it('taps a graded take → hands its stored grade to Results and navigates', async () => {
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText('Fifth Study')).toBeTruthy());

    // The card is a Pressable wrapping the title; fire its press.
    fireEvent.press(getByText('Fifth Study'));

    const handed = getLastGradingResult();
    expect(handed).not.toBeNull();
    expect(handed?.gradeLabel).toBe('B');
    expect(handed?.totalScore).toBe(84);
    expect(handed?.audioUrl).toBe(
      'http://testserver/media/submissions/142a62dd-9a2e-4469-a977-d0fbfb609683/take.wav',
    );
    expect(mockPush).toHaveBeenCalledWith('/results');
  });

  it('does not navigate for an ungraded take (grade: null)', async () => {
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText('Pending take')).toBeTruthy());

    fireEvent.press(getByText('Pending take'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(getLastGradingResult()).toBeNull();
  });
});
