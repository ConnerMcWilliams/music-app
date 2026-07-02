import { render } from '@testing-library/react-native';

import { ScoreBadge } from '@/components/ScoreBadge';
import { Colors } from '@/theme';

// RNTL renders through React 19's concurrent root, so `render` is awaited.
describe('ScoreBadge', () => {
  it('renders the numeric score', async () => {
    const { getByText } = await render(<ScoreBadge score={82} />);
    expect(getByText('82')).toBeTruthy();
  });

  it('uses the "good" color for high scores (90+)', async () => {
    const { getByText } = await render(<ScoreBadge score={94} />);
    expect(getByText('94').props.style).toEqual(
      expect.objectContaining({ color: Colors.good }),
    );
  });

  it('uses the gold color for scores below 90', async () => {
    const { getByText } = await render(<ScoreBadge score={89} />);
    expect(getByText('89').props.style).toEqual(
      expect.objectContaining({ color: Colors.gold }),
    );
  });
});
