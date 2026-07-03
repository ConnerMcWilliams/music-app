import { render } from '@testing-library/react-native';

import { MusicView } from '@/components/practice';
import { getExerciseById } from '@/data';

// The shared music view is the single implementation used by both Practice and
// Record, so these cover the states the spec requires: ready, loading, invalid.
describe('MusicView', () => {
  const exercise = getExerciseById('clarke-1');

  it('renders the study label and key when given an exercise', async () => {
    const { getByText } = await render(<MusicView exercise={exercise} />);
    expect(getByText('FIRST STUDIES · No. 1')).toBeTruthy();
    expect(getByText('C major')).toBeTruthy();
  });

  it('renders a loading placeholder', async () => {
    const { getByText } = await render(<MusicView exercise={exercise} loading />);
    expect(getByText('Loading study…')).toBeTruthy();
  });

  it('renders an invalid/missing state when no exercise is provided', async () => {
    const { getByText } = await render(<MusicView exercise={undefined} />);
    expect(getByText('Study unavailable')).toBeTruthy();
  });
});
