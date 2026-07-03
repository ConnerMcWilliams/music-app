import { fireEvent, render } from '@testing-library/react-native';

import StudiesScreen from '@/app/(tabs)/studies';
import SectionScreen from '@/app/section';

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
}));

describe('Studies → section → practice navigation', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('lists all 10 Clarke Studies as sections (no per-study key on the browse list)', async () => {
    // The browse list loads through useMockQuery, so wait for it to resolve.
    const { findByText, getByText, queryByText } = await render(<StudiesScreen />);
    expect(await findByText('First Study')).toBeTruthy();
    expect(getByText('Tenth Study')).toBeTruthy();
    // Browse rows show a study count, not a musical key.
    expect(getByText('26 studies')).toBeTruthy();
    expect(queryByText('C major')).toBeNull();
  });

  it('tapping a section opens its detail route with the section number', async () => {
    const { findByText } = await render(<StudiesScreen />);
    fireEvent.press(await findByText('Second Study'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/section',
      params: { section: '2' },
    });
  });

  it('the section detail lists that Study’s exercises, and études show their key', async () => {
    mockParams = { section: '2' };
    const { getByText } = await render(<SectionScreen />);
    // Section header + first/last exercises of the Second Study (19 exercises).
    expect(getByText('Second Study')).toBeTruthy();
    expect(getByText('Second Study, No. 1')).toBeTruthy();
    // The capstone étude carries a key on the detail list.
    expect(getByText('G major')).toBeTruthy();
  });

  it('tapping a study opens the Practice screen for that study', async () => {
    mockParams = { section: '2' };
    const { getByText } = await render(<SectionScreen />);
    fireEvent.press(getByText('Second Study, No. 1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/practice',
      params: { exerciseId: 'clarke-2-1' },
    });
  });

  it('shows an unavailable state for an unknown section', async () => {
    mockParams = { section: '999' };
    const { getAllByText } = await render(<SectionScreen />);
    // Shown in both the header and the empty-state placeholder.
    expect(getAllByText('Study unavailable').length).toBeGreaterThanOrEqual(1);
  });
});
