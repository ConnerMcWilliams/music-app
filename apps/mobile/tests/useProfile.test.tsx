import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { fetchProfileStats } from '@/services/profile';

// The hook composes two sources: identity from AuthContext and streak/stats
// from the profile service. Both are mocked so the test is pure and offline.
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/services/profile', () => ({
  fetchProfileStats: jest.fn(),
  EMPTY_PROFILE_STATS: { dayStreak: 0, personalBest: 0, studiesDone: 0, avgScore: 0 },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockFetchStats = fetchProfileStats as jest.Mock;

const authUser = {
  id: 'u1',
  email: 'marcus@example.com',
  displayName: 'Marcus Bell',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('useProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives identity from the authenticated user', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchStats.mockResolvedValue({
      dayStreak: 7,
      personalBest: 12,
      studiesDone: 4,
      avgScore: 83,
    });

    const { result } = await renderHook(() => useProfile());

    expect(result.current.name).toBe('Marcus Bell');
    expect(result.current.initials).toBe('MB');
    expect(result.current.joined).toBe('Joined 2024');
  });

  it('fills streak/stats from the backend', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchStats.mockResolvedValue({
      dayStreak: 7,
      personalBest: 12,
      studiesDone: 4,
      avgScore: 83,
    });

    const { result } = await renderHook(() => useProfile());

    await waitFor(() => expect(result.current.dayStreak).toBe(7));
    expect(result.current.personalBest).toBe(12);
    expect(result.current.studiesDone).toBe(4);
    expect(result.current.avgScore).toBe(83);
    expect(mockFetchStats).toHaveBeenCalledTimes(1);
  });

  it('keeps empty stats when the fetch fails', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchStats.mockRejectedValue(new Error('offline'));

    const { result } = await renderHook(() => useProfile());

    // Let the rejected promise settle without throwing.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.dayStreak).toBe(0);
    expect(result.current.avgScore).toBe(0);
    // Identity is still available even when stats can't be fetched.
    expect(result.current.name).toBe('Marcus Bell');
  });

  it('does not fetch stats when signed out', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = await renderHook(() => useProfile());

    expect(mockFetchStats).not.toHaveBeenCalled();
    expect(result.current.name).toBe('');
    expect(result.current.dayStreak).toBe(0);
  });
});
