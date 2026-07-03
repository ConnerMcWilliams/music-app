import { fireEvent, render } from '@testing-library/react-native';

import PracticeScreen from '@/app/(tabs)/practice';
import RecordScreen from '@/app/record';

// Mock expo-router so we can drive route params and observe navigation. Names
// are `mock`-prefixed so the hoisted jest.mock factory may reference them.
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockParams,
  // Run the focus effect like a mount effect so its cleanup runs on unmount.
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), [cb]);
  },
}));

describe('Practice ↔ Record navigation', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('the Practice screen shows metronome practice UI (not the record capture UI)', async () => {
    const { getByText, queryByText } = await render(<PracticeScreen />);
    expect(getByText('Metronome')).toBeTruthy();
    expect(getByText('Switch to Record Mode')).toBeTruthy();
    // The live-capture affordance belongs to the Record screen, not Practice.
    expect(queryByText('Tap to record live')).toBeNull();
  });

  it('defaults to today’s study when opened with no params (the Practice tab)', async () => {
    mockParams = {};
    const { getByText } = await render(<PracticeScreen />);
    // getTodayExercise() → the in-progress study, No. 2.
    expect(getByText('Clarke Study No. 2')).toBeTruthy();
  });

  it('opens the selected study when given an exerciseId', async () => {
    mockParams = { exerciseId: 'clarke-1' };
    const { getByText } = await render(<PracticeScreen />);
    expect(getByText('Clarke Study No. 1')).toBeTruthy();
    expect(getByText('FIRST STUDIES · No. 1')).toBeTruthy();
  });

  it('Record button navigates to /record preserving the study id', async () => {
    mockParams = { exerciseId: 'clarke-1' };
    const { getByText } = await render(<PracticeScreen />);
    fireEvent.press(getByText('Switch to Record Mode'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/record',
      params: { exerciseId: 'clarke-1' },
    });
  });

  it('shows an invalid-study state for an unknown exerciseId', async () => {
    mockParams = { exerciseId: 'does-not-exist' };
    const { getByText, getAllByText, queryByText } = await render(<PracticeScreen />);
    // Shown in both the header and the music-view placeholder.
    expect(getAllByText('Study unavailable').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Pick a study from the Studies tab to start practicing.')).toBeTruthy();
    // No record affordance when the study is invalid.
    expect(queryByText('Switch to Record Mode')).toBeNull();
  });

  it('Practice and Record render the same study’s music view', async () => {
    mockParams = { exerciseId: 'clarke-1' };
    const practice = await render(<PracticeScreen />);
    expect(practice.getByText('FIRST STUDIES · No. 1')).toBeTruthy();
    practice.unmount();

    const record = await render(<RecordScreen />);
    expect(record.getByText('FIRST STUDIES · No. 1')).toBeTruthy();
  });
});
