import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useAuth } from '@/context/AuthContext';
import { authClient } from '@/services/auth';

// Drives the real ProfileScreen so the "Score progress" chart renders from real
// submission scores (not the old SCORE_TREND placeholder), and exercises the
// Day/Week granularity toggle end to end.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // Run the focus effect like a mount effect (fires on initial focus).
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), [cb]);
  },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/services/profile', () => ({
  fetchProfileStats: jest.fn().mockResolvedValue({
    dayStreak: 0,
    personalBest: 0,
    studiesDone: 0,
    avgScore: 0,
  }),
  EMPTY_PROFILE_STATS: { dayStreak: 0, personalBest: 0, studiesDone: 0, avgScore: 0 },
}));
jest.mock('@/services/auth', () => ({ authClient: { authedRequest: jest.fn() } }));

const mockUseAuth = useAuth as jest.Mock;
const mockAuthedRequest = authClient.authedRequest as jest.Mock;

function gradedRow(id: string, createdAt: string, score: number) {
  return {
    submission_id: id,
    exercise_id: 'clarke-2',
    exercise_title: 'Second Study',
    created_at: createdAt,
    duration_seconds: 40,
    audio_url: `http://testserver/media/${id}.wav`,
    grade: {
      total_score: score,
      grade_label: 'B',
      categories: [],
      feedback_author: 'Prof. Halvorsen',
      feedback_initials: 'PH',
      feedback_text: 'Nice work.',
    },
  };
}

// Three graded takes across three different weeks of June — enough points for the
// chart to render under both Day and Week granularity. Scores rise 70 → 90.
const WIRE = {
  count: 3,
  next: null,
  previous: null,
  results: [
    gradedRow('c', '2026-06-29T15:00:00Z', 90),
    gradedRow('b', '2026-06-15T15:00:00Z', 82),
    gradedRow('a', '2026-06-01T15:00:00Z', 70),
  ],
};

const AUTH_USER = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice Adams',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('Profile "Score progress" — real submission trend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: AUTH_USER });
    mockAuthedRequest.mockResolvedValue({ ok: true, json: async () => WIRE });
  });

  it('renders the chart with a computed trend and Day/Week toggle', async () => {
    const { getByText, queryByText } = await render(<ProfileScreen />);

    // Trend label is computed from the data (90 − 70 = 20 pts), not hardcoded.
    await waitFor(() => expect(getByText(/20 pts/)).toBeTruthy());
    expect(queryByText('Not enough data yet')).toBeNull();
    expect(queryByText('▲ 18 pts · 8 weeks')).toBeNull(); // the old placeholder

    // Granularity toggle is present.
    expect(getByText('Day')).toBeTruthy();
    expect(getByText('Week')).toBeTruthy();
  });

  it('re-buckets without crashing when switching to Week', async () => {
    const { getByText, queryByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText(/20 pts/)).toBeTruthy());

    fireEvent.press(getByText('Week'));

    // Still three weekly points (each take is its own week), so the chart stays
    // up with the same 20-pt rise rather than collapsing to the empty state.
    expect(getByText(/20 pts/)).toBeTruthy();
    expect(queryByText('Not enough data yet')).toBeNull();
  });
});
