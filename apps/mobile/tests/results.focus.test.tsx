import { act, render } from '@testing-library/react-native';

import ResultsScreen from '@/app/(tabs)/results';
import { setLastGradingResult } from '@/services/lastGradingResult';
import type { GradingResult } from '@/types';

// Regression: Results is a persistent tab, so navigating to it from a tapped
// recording only re-focuses it — it does not remount. The screen must re-read
// the hand-off store on focus, or every tap shows whichever take rendered first
// (usually the most recent). Here we mock useFocusEffect to expose its callback
// and re-fire it, standing in for a re-focus.

// Capture the focus callback so the test can re-fire it (stands in for a
// re-focus). The screen's initial state already reads the store on mount, so the
// mock only needs to record the callback — no need to auto-run it.
let mockFocusCb: () => void = () => {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    mockFocusCb = cb;
  },
}));

// Avoid the mock-query timer; when a grade is handed off it's used regardless.
jest.mock('@/hooks/useMockQuery', () => ({
  useMockQuery: () => ({ data: null, loading: false, refetch: jest.fn() }),
}));

function grade(title: string, score: number): GradingResult {
  return {
    submissionId: `s-${title}`,
    exerciseId: `ex-${title}`,
    exerciseTitle: title,
    totalScore: score,
    gradeLabel: 'B',
    categories: [{ label: 'Pitch Accuracy', score: 95 }],
    feedbackAuthor: 'Prof. Halvorsen',
    feedbackInitials: 'PH',
    feedbackText: `Nice ${title}.`,
    audioUrl: null,
  };
}

describe('Results re-reads the tapped take on focus', () => {
  it('shows a different take after the store changes and the tab re-focuses', async () => {
    setLastGradingResult(grade('Fifth Study', 84));
    const { getByText, queryByText } = await render(<ResultsScreen />);

    // First render reflects the initially handed-off take.
    expect(getByText('GRADED · FIFTH STUDY')).toBeTruthy();

    // Simulate tapping a different recording: the store is updated, then the
    // Results tab re-focuses (no remount).
    setLastGradingResult(grade('Second Study', 71));
    await act(async () => {
      mockFocusCb();
    });

    expect(getByText('GRADED · SECOND STUDY')).toBeTruthy();
    expect(queryByText('GRADED · FIFTH STUDY')).toBeNull();
  });
});
