import { act, render, userEvent } from '@testing-library/react-native';

import PracticeScreen from '@/app/(tabs)/practice';
import { AnalyticalModeControls } from '@/components/practice';
import type { LiveSessionSummary, MicTake } from '@/lib/analysis';

/**
 * Offering the finished live recording for grading.
 *
 * Analytical mode captures the audio it judges, so a player who liked their run
 * grades *that* run instead of playing it again. The take only exists after a
 * real session, so the hook is injected here; `record.liveTakeHandoff` covers
 * the receiving end.
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
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), [cb]);
  },
}));

jest.mock('@/hooks/useTodayStudy', () => ({
  useTodayStudy: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STUDY_SECTIONS } = require('@/data/studies');
    return {
      exercise: STUDY_SECTIONS[0].exercises[0],
      section: STUDY_SECTIONS[0],
      loading: false,
      refetch: () => {},
    };
  },
}));

let mockSummary: LiveSessionSummary | null = null;
const mockDisable = jest.fn();

jest.mock('@/hooks/useLiveAnalysis', () => ({
  useLiveAnalysis: () => ({
    state: {
      phase: 'finished',
      verdicts: new Map(),
      summary: { correct: 3, wrong: 1, missed: 0, judged: 4, total: 4 },
    },
    isActive: false,
    error: undefined,
    lastSummary: mockSummary,
    enable: jest.fn(),
    disable: mockDisable,
    toggle: jest.fn(),
  }),
}));

const TAKE: MicTake = { uri: 'file:///cache/live-takes/take-1.wav', durationSeconds: 42.25 };

const summaryWith = (take: MicTake | null): LiveSessionSummary => ({
  judgements: [],
  counts: { correct: 3, wrong: 1, missed: 0, judged: 4, total: 4 },
  take,
  medianTimingErrorSeconds: null,
});

const pressAsync = async (element: Parameters<typeof userEvent.press>[0]) => {
  await act(async () => {
    await userEvent.press(element);
  });
};

describe('Practice screen — submitting a live take', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockClear();
    mockDisable.mockClear();
    mockSummary = null;
  });

  it('offers nothing before a session has produced a recording', async () => {
    const { queryByLabelText } = await render(<PracticeScreen />);
    expect(queryByLabelText('Submit this take for grading')).toBeNull();
  });

  it('offers the take once a finished session left a usable file', async () => {
    mockSummary = summaryWith(TAKE);
    const { getByLabelText } = await render(<PracticeScreen />);
    expect(getByLabelText('Submit this take for grading')).toBeTruthy();
  });

  /**
   * A rotated multi-part recording, a mic failure, or the web silent backend
   * all yield a null take. Offering to submit one would push Record into review
   * over audio that cannot be uploaded.
   */
  it('offers nothing when the session produced no single file', async () => {
    mockSummary = summaryWith(null);
    const { queryByLabelText } = await render(<PracticeScreen />);
    expect(queryByLabelText('Submit this take for grading')).toBeNull();
  });

  it('hands the take to Record with its uri and duration', async () => {
    mockSummary = summaryWith(TAKE);
    const { getByLabelText } = await render(<PracticeScreen />);

    await pressAsync(getByLabelText('Submit this take for grading'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const [{ pathname, params }] = mockPush.mock.calls[0];
    expect(pathname).toBe('/record');
    expect(params.takeUri).toBe(TAKE.uri);
    expect(params.takeDuration).toBe('42.25');
    expect(params.exerciseId).toBeTruthy();
  });

  it('releases the microphone before leaving the screen', async () => {
    mockSummary = summaryWith(TAKE);
    const { getByLabelText } = await render(<PracticeScreen />);

    await pressAsync(getByLabelText('Submit this take for grading'));

    // The mic must not stay live while Record opens its own recorder.
    expect(mockDisable).toHaveBeenCalled();
  });
});

describe('AnalyticalModeControls — submit affordance', () => {
  const base = {
    phase: 'finished' as const,
    summary: { correct: 0, wrong: 0, missed: 0, judged: 0, total: 8 },
    onToggle: jest.fn(),
  };

  it('hides the submit action while a session is running', async () => {
    const { queryByLabelText } = await render(
      <AnalyticalModeControls {...base} isActive onSubmitTake={jest.fn()} />,
    );
    // Mid-session the recording isn't finished, so there is nothing to submit.
    expect(queryByLabelText('Submit this take for grading')).toBeNull();
  });

  it('hides the submit action when the study cannot be analysed', async () => {
    const { queryByLabelText } = await render(
      <AnalyticalModeControls
        {...base}
        isActive={false}
        disabledReason="No notation yet."
        onSubmitTake={jest.fn()}
      />,
    );
    expect(queryByLabelText('Submit this take for grading')).toBeNull();
  });

  it('shows it between runs', async () => {
    const onSubmitTake = jest.fn();
    const { getByLabelText } = await render(
      <AnalyticalModeControls {...base} isActive={false} onSubmitTake={onSubmitTake} />,
    );
    await pressAsync(getByLabelText('Submit this take for grading'));
    expect(onSubmitTake).toHaveBeenCalledTimes(1);
  });
});
