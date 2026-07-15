import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/context/AuthContext';
import { useTodayStudy } from '@/hooks/useTodayStudy';
import { fetchStudyScores } from '@/services/studyScores';

// The hook composes auth (fetch only when signed in) with the study-scores
// service. Both are mocked so the test is pure and offline; the real catalog
// walk (lib/todayStudy) runs.
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/services/studyScores', () => ({ fetchStudyScores: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const mockFetchScores = fetchStudyScores as jest.Mock;

const authUser = {
  id: 'u1',
  email: 'marcus@example.com',
  displayName: 'Marcus Bell',
  createdAt: '2024-06-15T12:00:00Z',
};

describe('useTodayStudy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves the first catalog study without fetching when signed out', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = await renderHook(() => useTodayStudy());

    expect(mockFetchScores).not.toHaveBeenCalled();
    expect(result.current.exercise.id).toBe('clarke-1-1');
    expect(result.current.loading).toBe(false);
  });

  it('advances to the first unpassed study once scores resolve', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchScores.mockResolvedValue({
      passingScore: 70,
      bySlug: {
        'clarke-1-1': { bestScore: 84, passed: true },
        'clarke-1-2': { bestScore: 71, passed: true },
      },
    });

    const { result } = await renderHook(() => useTodayStudy());

    await waitFor(() => expect(result.current.exercise.id).toBe('clarke-1-3'));
    expect(result.current.section.label).toBe('First Study');
    expect(result.current.loading).toBe(false);
    expect(mockFetchScores).toHaveBeenCalledTimes(1);
  });

  it('keeps the fallback study when the fetch fails', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchScores.mockRejectedValue(new Error('offline'));

    const { result } = await renderHook(() => useTodayStudy());

    // Let the rejected promise settle without throwing.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.exercise.id).toBe('clarke-1-1');
    expect(result.current.loading).toBe(false);
  });

  it('refetch re-pulls the scores (the Today screen calls it on focus)', async () => {
    mockUseAuth.mockReturnValue({ user: authUser });
    mockFetchScores.mockResolvedValue({ passingScore: 70, bySlug: {} });

    const { result } = await renderHook(() => useTodayStudy());
    await waitFor(() => expect(mockFetchScores).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockFetchScores).toHaveBeenCalledTimes(2));
  });
});
