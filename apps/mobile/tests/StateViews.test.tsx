import { render, fireEvent } from '@testing-library/react-native';

import { LoadingState, EmptyState, ErrorState } from '@/components/StateViews';

// RNTL renders through React 19's concurrent root, so `render` is awaited.
describe('LoadingState', () => {
  it('renders the default loading message', async () => {
    const { getByText } = await render(<LoadingState />);
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('renders a custom loading message', async () => {
    const { getByText } = await render(<LoadingState message="Fetching studies…" />);
    expect(getByText('Fetching studies…')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders the default empty title and message', async () => {
    const { getByText } = await render(<EmptyState />);
    expect(getByText('Nothing here yet')).toBeTruthy();
    expect(getByText('Check back after your next practice session.')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('does not render a retry button when no handler is provided', async () => {
    const { queryByText } = await render(<ErrorState />);
    expect(queryByText('Try again')).toBeNull();
  });

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(<ErrorState onRetry={onRetry} />);

    fireEvent.press(getByText('Try again'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
