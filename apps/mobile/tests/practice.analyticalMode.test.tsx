import { act, render, userEvent } from '@testing-library/react-native';

import PracticeScreen from '@/app/(tabs)/practice';
import { CATALOG_STUDIES, getMusicXmlForExercise } from '@/data';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockParams,
  // Run the focus effect like a mount effect so its cleanup runs on unmount.
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

/** RNTL v14 needs presses awaited inside act. */
const pressAsync = async (element: Parameters<typeof userEvent.press>[0]) => {
  await act(async () => {
    await userEvent.press(element);
  });
};

/** A catalog study the OMR pipeline hasn't transcribed yet, if any exists. */
const untranscribed = CATALOG_STUDIES.find((e) => !getMusicXmlForExercise(e.id));

describe('Practice screen — analytical mode', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockClear();
  });

  it('offers analytical mode on a study that has notation', async () => {
    const { getByLabelText, getByText } = await render(<PracticeScreen />);
    expect(getByText('Analytical Mode')).toBeTruthy();
    expect(getByLabelText('Start analytical mode')).toBeTruthy();
  });

  it('starts and stops from a single control', async () => {
    const view = await render(<PracticeScreen />);

    await pressAsync(view.getByLabelText('Start analytical mode'));
    // The one button owns both the metronome and the analyser, so the label
    // flipping is the whole transport.
    expect(view.getByLabelText('Stop analytical mode')).toBeTruthy();

    await pressAsync(view.getByLabelText('Stop analytical mode'));
    expect(view.getByLabelText('Start analytical mode')).toBeTruthy();
  });

  it('shows an empty tally before anything has been played', async () => {
    const { getByLabelText } = await render(<PracticeScreen />);
    expect(getByLabelText('Correct 0')).toBeTruthy();
    expect(getByLabelText('Wrong 0')).toBeTruthy();
    expect(getByLabelText('Missed 0')).toBeTruthy();
  });

  it('counts the notes in the study it will judge', async () => {
    const { getByLabelText } = await render(<PracticeScreen />);
    // The catalog's first study is transcribed, so there is something to judge.
    const total = getByLabelText(/^Of \d+$/);
    expect(total).toBeTruthy();
  });

  it('seeds the tempo from the study marking when one is written', async () => {
    // The capstone études are the catalog entries carrying a real tempo string.
    const withTempo = CATALOG_STUDIES.find(
      (e) => /\d{2,3}/.test(e.tempo) && getMusicXmlForExercise(e.id),
    );
    if (!withTempo) return; // nothing to assert against in this catalogue
    mockParams = { exerciseId: withTempo.id };

    const { getByLabelText } = await render(<PracticeScreen />);
    const bpm = Number(/(\d{2,3})/.exec(withTempo.tempo)?.[1]);
    expect(getByLabelText(`${bpm} beats per minute`)).toBeTruthy();
  });

  it('stops analytical mode when leaving for the Record screen', async () => {
    const view = await render(<PracticeScreen />);
    await pressAsync(view.getByLabelText('Start analytical mode'));

    await pressAsync(view.getByLabelText('Switch to record mode'));

    expect(mockPush).toHaveBeenCalled();
    // The microphone must not follow the user to another screen.
    expect(view.getByLabelText('Start analytical mode')).toBeTruthy();
  });

  it('explains itself instead of failing on a study with no notation', async () => {
    if (!untranscribed) return; // whole catalogue is transcribed
    mockParams = { exerciseId: untranscribed.id };

    const { getByLabelText, getByText } = await render(<PracticeScreen />);
    expect(getByText(/doesn’t have notation yet/)).toBeTruthy();

    const button = getByLabelText('Start analytical mode');
    expect(button.props.accessibilityState?.disabled).toBe(true);

    // Pressing a disabled control changes nothing.
    await pressAsync(button);
    expect(getByLabelText('Start analytical mode')).toBeTruthy();
  });
});
