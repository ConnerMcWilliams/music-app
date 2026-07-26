import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ClarkeStep from '@/app/onboarding/clarke';
import NameStep from '@/app/onboarding/index';
import InstrumentStep from '@/app/onboarding/instrument';
import PracticeStep from '@/app/onboarding/practice';
import { ONBOARDING_STEPS } from '@/components/onboarding';
import { useAuth } from '@/context/AuthContext';
import { ONBOARDING_ROUTES } from '@/lib/onboarding/flow';
import { authClient } from '@/services/auth';

// Drives the real onboarding screens against the exact snake_case wire body of
// GET/PATCH /api/preferences/, so the service mapping (services/preferences.ts)
// and the save-and-advance hook (hooks/useOnboardingStep.ts) both actually run.
// Only the transport and the router are stubbed.

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

// Steps read their answers from the onboarding layout's context. Each screen is
// rendered on its own here, so stand in for the provider with the same hook the
// real layout holds — the fetch, PATCH, and mapping still run for real.
jest.mock('@/app/onboarding/_layout', () => ({
  useOnboardingPreferences: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/hooks/usePreferences').usePreferences();
  },
}));

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('@/services/auth', () => ({
  authClient: { authedRequest: jest.fn() },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockAuthedRequest = authClient.authedRequest as jest.Mock;
const mockRefreshUser = jest.fn().mockResolvedValue(undefined);

/** GET/PATCH /api/preferences/ wire shape — nothing answered yet by default. */
function wire(overrides: Record<string, unknown> = {}) {
  return {
    display_name: '',
    instrument: '',
    experience_level: '',
    primary_goal: '',
    practice_days_goal: 5,
    reminder_time: null,
    reminder_enabled: false,
    clarke_start_section: null,
    onboarding_completed: false,
    ...overrides,
  };
}

/** Every request the screen made, in order, as `[method, parsed body]`. */
function requests(): [string, Record<string, unknown> | null][] {
  return mockAuthedRequest.mock.calls.map(([, init]) => [
    init.method,
    init.body ? JSON.parse(init.body) : null,
  ]);
}

/** The body of the step's PATCH — what actually reached the server. */
function patchBody(): Record<string, unknown> {
  const patch = requests().find(([method]) => method === 'PATCH');
  if (!patch) throw new Error('No PATCH was sent.');
  return patch[1] as Record<string, unknown>;
}

/** Answer the preferences endpoint: GET returns `saved`, PATCH echoes the merge. */
function serve(saved: Record<string, unknown> = {}) {
  mockAuthedRequest.mockImplementation(async (_path: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () =>
      init.method === 'PATCH'
        ? wire({ ...saved, ...(JSON.parse(String(init.body)) as object) })
        : wire(saved),
  }));
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

beforeEach(() => {
  mockSearchParams = {};
  mockRefreshUser.mockClear();
  mockUseAuth.mockReturnValue({
    user: { id: 'u1', email: 'player@example.com', displayName: '', onboardingCompleted: false },
    refreshUser: mockRefreshUser,
  });
  serve();
});

describe('onboarding flow', () => {
  it('has one step per route', () => {
    // The progress dots count steps; the router walks routes. They must agree.
    expect(ONBOARDING_ROUTES).toHaveLength(ONBOARDING_STEPS);
  });

  it('saves the name and advances to the instrument step', async () => {
    const screen = await render(<NameStep />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Herbert'), '  Marcus Bell  ');
    });
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({ display_name: 'Marcus Bell' });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/instrument');
    // Nothing sits behind step 1 but the signup screen the user already left.
    expect(screen.queryByLabelText('Go back')).toBeNull();
  });

  it('pre-fills the name a Google account already carries', async () => {
    serve({ display_name: 'Herbert L. Clarke' });

    const screen = await render(<NameStep />);

    await waitFor(() => expect(screen.getByDisplayValue('Herbert L. Clarke')).toBeTruthy());
  });

  it('will not advance past a step with no answer', async () => {
    const screen = await render(<InstrumentStep />);

    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(requests().some(([method]) => method === 'PATCH')).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('saves the chosen instrument and advances', async () => {
    const screen = await render(<InstrumentStep />);

    await press(screen.getByRole('radio', { name: 'Flugelhorn' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({ instrument: 'flugelhorn' });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/experience');
  });

  it('shows a resumed run what it already answered', async () => {
    // The save-as-you-go contract: quitting mid-flow keeps prior answers.
    serve({ instrument: 'tuba' });

    const screen = await render(<InstrumentStep />);

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Tuba', selected: true })).toBeTruthy(),
    );
  });

  it('saves the practice cadence and the reminder together', async () => {
    const screen = await render(<PracticeStep />);

    await press(screen.getByRole('radio', { name: '7 days per week' }));
    await press(screen.getByRole('radio', { name: '8:00 am' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({
      practice_days_goal: 7,
      reminder_time: '08:00:00',
      reminder_enabled: true,
    });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/clarke');
  });

  it('stamps completion on the last step, then refreshes before leaving', async () => {
    const screen = await render(<ClarkeStep />);

    await press(screen.getByRole('radio', { name: /Fifth Study/ }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({ clarke_start_section: 5, complete: true });
    // The guard reads `onboardingCompleted` off the session, so the refresh has
    // to land before the navigation or it bounces the user straight back in.
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends an explicit null for "New to Clarke"', async () => {
    // null is the answer, not an absent key — an omitted field would leave a
    // previously chosen section in place.
    const screen = await render(<ClarkeStep />);

    await press(screen.getByRole('radio', { name: /New to Clarke/ }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({ clarke_start_section: null, complete: true });
  });

  it('edits one answer from the account screen without completing onboarding', async () => {
    mockSearchParams = { edit: '1' };
    serve({ clarke_start_section: 5, onboarding_completed: true });

    const screen = await render(<ClarkeStep />);

    await press(screen.getByRole('radio', { name: /Third Study/ }));
    await press(screen.getByRole('button', { name: 'Save' }));

    expect(patchBody()).toEqual({ clarke_start_section: 3 });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the user on the step and shows why when a save fails', async () => {
    mockAuthedRequest.mockImplementation(async (_path: string, init: RequestInit) =>
      init.method === 'PATCH'
        ? {
            ok: false,
            status: 400,
            json: async () => ({ instrument: ['Select a valid choice.'] }),
          }
        : { ok: true, status: 200, json: async () => wire() },
    );

    const screen = await render(<InstrumentStep />);

    await press(screen.getByRole('radio', { name: 'Trombone' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Select a valid choice.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
