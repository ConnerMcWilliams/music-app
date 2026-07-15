import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TodayScreen from '@/app/(tabs)/index';
import { useAuth } from '@/context/AuthContext';
import { authClient } from '@/services/auth';

// The Today card now surfaces the first study the user hasn't passed (was a
// static mock). This drives the actual TodayScreen against the exact
// snake_case wire body of GET /api/profile/study-scores/, so the real service
// mapping (services/studyScores.ts) and catalog walk (lib/todayStudy.ts) run.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  // Run the focus effect like a mount effect (fires on initial focus).
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), [cb]);
  },
}));

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

// Identity/streak come from a separate source; stub it so this test is about
// the study card only. useProfile reads these two exports.
jest.mock('@/services/profile', () => ({
  fetchProfileStats: jest.fn().mockResolvedValue({
    dayStreak: 0,
    personalBest: 0,
    studiesDone: 0,
    avgScore: 0,
  }),
  EMPTY_PROFILE_STATS: { dayStreak: 0, personalBest: 0, studiesDone: 0, avgScore: 0 },
}));

// Mock only the transport; the real fetchStudyScores() mapping runs.
jest.mock('@/services/auth', () => ({
  authClient: { authedRequest: jest.fn() },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockAuthedRequest = authClient.authedRequest as jest.Mock;

// GET /api/profile/study-scores/ wire shape: the user passed the first two
// studies of the First Study section, so the card should surface No. 3.
const WIRE = {
  passing_score: 70,
  studies: [
    { slug: 'clarke-1-1', best_score: 84, passed: true },
    { slug: 'clarke-1-2', best_score: 71, passed: true },
    { slug: 'clarke-1-3', best_score: 55, passed: false },
  ],
};

const AUTH_USER = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice Adams',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('Today card — first unpassed study', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: AUTH_USER });
    mockAuthedRequest.mockResolvedValue({ ok: true, json: async () => WIRE });
  });

  it('shows the first study the user has not passed', async () => {
    const { getAllByText, getByText } = await render(<TodayScreen />);

    await waitFor(() =>
      expect(mockAuthedRequest).toHaveBeenCalledWith('/api/profile/study-scores/', {
        method: 'GET',
      }),
    );

    await waitFor(() => expect(getByText('Clarke Study No. 3')).toBeTruthy());
    expect(getByText('First Study · No. 3')).toBeTruthy();
    // Catalog studies without verified notation metadata show placeholders
    // for all three stats (KEY / TEMPO / RANGE).
    expect(getAllByText('—')).toHaveLength(3);
  });

  it('Begin Practice opens that study on the Practice screen', async () => {
    const { getByText } = await render(<TodayScreen />);
    await waitFor(() => expect(getByText('Clarke Study No. 3')).toBeTruthy());

    fireEvent.press(getByText('Begin Practice'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/practice',
      params: { exerciseId: 'clarke-1-3' },
    });
  });

  it('falls back to the very first study when the fetch fails', async () => {
    mockAuthedRequest.mockRejectedValue(new Error('offline'));

    const { getByText } = await render(<TodayScreen />);

    await waitFor(() => expect(getByText('Clarke Study No. 1')).toBeTruthy());
    expect(getByText('First Study · No. 1')).toBeTruthy();
  });
});
