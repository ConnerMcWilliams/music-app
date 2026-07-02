import { act, renderHook } from '@testing-library/react-native';

import { useMockQuery } from '@/hooks/useMockQuery';

/**
 * `useMockQuery` backs the mock grading-result / history screens, so these tests
 * exercise the three async states the UI must handle: pending, success, failure.
 *
 * RNTL runs through React 19's concurrent root, so `renderHook` is awaited and
 * timer advances are wrapped in an async `act`.
 */
describe('useMockQuery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in the pending (loading) state', async () => {
    const { result } = await renderHook(() => useMockQuery(() => 'graded'));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resolves to the success state with data after the delay', async () => {
    const { result } = await renderHook(() =>
      useMockQuery(() => ({ totalScore: 91 }), { delayMs: 100 }),
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ totalScore: 91 });
    expect(result.current.error).toBeNull();
  });

  it('resolves to the failure state when shouldFail is set', async () => {
    const { result } = await renderHook(() =>
      useMockQuery(() => 'graded', { delayMs: 100, shouldFail: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('refetch returns to loading and then resolves again', async () => {
    const { result } = await renderHook(() =>
      useMockQuery(() => 'graded', { delayMs: 100 }),
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.data).toBe('graded');

    await act(async () => {
      result.current.refetch();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('graded');
  });
});
