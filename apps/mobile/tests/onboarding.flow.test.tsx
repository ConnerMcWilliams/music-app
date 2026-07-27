import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ClarkeStep from '@/app/onboarding/clarke';
import ExperienceStep from '@/app/onboarding/experience';
import GoalStep from '@/app/onboarding/goal';
import InstrumentStep from '@/app/onboarding/instrument';
import NameStep from '@/app/onboarding/name';
import PracticeStep from '@/app/onboarding/practice';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_ONBOARDING_CONFIG } from '@/data/onboardingConfig';
import { ONBOARDING_STEP_KEYS, STEP_ROUTES, type OnboardingStepKey } from '@/lib/onboarding/flow';
import { authClient } from '@/services/auth';
import type { ConfiguredStep } from '@/services/onboardingConfig';

// Drives the real onboarding screens against the exact snake_case wire bodies of
// GET/PATCH /api/preferences/ and GET /api/onboarding/config/, so the service
// mappings (services/preferences.ts, services/onboardingConfig.ts) and the
// save-and-advance hook (hooks/useOnboardingStep.ts) all actually run. Only the
// transport and the router are stubbed.

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

// Steps read their answers and their configured copy from the onboarding
// layout's context. Each screen is rendered on its own here, so stand in for the
// provider with the same hooks the real layout holds — the fetches, the PATCH,
// and the mapping still run for real.
jest.mock('@/app/onboarding/_layout', () => ({
  useOnboardingPreferences: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/hooks/usePreferences').usePreferences();
  },
  useOnboardingFlowConfig: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/hooks/useOnboardingConfig').useOnboardingConfig();
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

const PREFERENCES_PATH = '/api/preferences/';
const CONFIG_PATH = '/api/onboarding/config/';
const VIEWS_PATH = '/api/onboarding/views/';

/** GET /api/onboarding/config/ wire shape — the flow as it shipped by default. */
function configWire(steps: ConfiguredStep[] = DEFAULT_ONBOARDING_CONFIG.steps) {
  return {
    variant_key: 'default',
    variant_name: 'Default flow',
    experiment_key: null,
    arm_key: null,
    steps: steps.map((step) => ({
      step_key: step.stepKey,
      copy: step.copy,
      options: step.options,
    })),
  };
}

/** The shipped flow with some steps left out, as a shortened variant serves it. */
function stepsWithout(...omitted: OnboardingStepKey[]): ConfiguredStep[] {
  return DEFAULT_ONBOARDING_CONFIG.steps.filter((step) => !omitted.includes(step.stepKey));
}

/** Every preferences request the screen made, as `[method, parsed body]`. */
function requests(): [string, Record<string, unknown> | null][] {
  return mockAuthedRequest.mock.calls
    .filter(([path]) => path === PREFERENCES_PATH)
    .map(([, init]) => [init.method, init.body ? JSON.parse(init.body) : null]);
}

/** The step-view beacons the screen fired, as step keys. */
function beacons(): string[] {
  return mockAuthedRequest.mock.calls
    .filter(([path]) => path === VIEWS_PATH)
    .map(([, init]) => JSON.parse(init.body).step_key);
}

/** The body of the step's PATCH — what actually reached the server. */
function patchBody(): Record<string, unknown> {
  const patch = requests().find(([method]) => method === 'PATCH');
  if (!patch) throw new Error('No PATCH was sent.');
  return patch[1] as Record<string, unknown>;
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/**
 * Answer both endpoints the flow reads: the served config, and the caller's
 * answers (GET returns `saved`, PATCH echoes the merge).
 *
 * Routed by **path**, not by method — both endpoints are read with GET, and
 * answering one with the other's body is the confusing failure this avoids.
 */
function serve(saved: Record<string, unknown> = {}, steps?: ConfiguredStep[]) {
  mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
    if (path === CONFIG_PATH) return ok(configWire(steps));
    if (path === VIEWS_PATH) return { ok: true, status: 204, json: async () => null };
    return ok(
      init.method === 'PATCH'
        ? wire({ ...saved, ...(JSON.parse(String(init.body)) as object) })
        : wire(saved),
    );
  });
}

/**
 * Serve everything as normal except the *preferences* GET, which the test
 * releases by hand, so a step can be exercised while its stored answers are
 * still in flight. Returns the release: awaiting it settles the GET and the
 * re-render it causes.
 */
function deferredGet(saved: Record<string, unknown>) {
  let release = () => {};
  mockAuthedRequest.mockImplementation((path: string, init: RequestInit) => {
    if (path === CONFIG_PATH) return Promise.resolve(ok(configWire()));
    if (path === VIEWS_PATH) {
      return Promise.resolve({ ok: true, status: 204, json: async () => null });
    }
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as object;
      return Promise.resolve(ok(wire({ ...saved, ...body })));
    }
    return new Promise((resolve) => {
      release = () => resolve(ok(wire(saved)));
    });
  });
  return async () => {
    await act(async () => {
      release();
    });
  };
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
  it('has a screen for every step the config can name', () => {
    // Config names steps; the router walks routes. A step the server could send
    // that this build has no screen for would be unreachable.
    expect(Object.keys(STEP_ROUTES).sort()).toEqual([...ONBOARDING_STEP_KEYS].sort());
  });

  it('ships a bundled flow covering every step', () => {
    // The fallback has to be a *complete* flow — it is what runs when the
    // config request fails, and onboarding is a hard gate.
    expect(DEFAULT_ONBOARDING_CONFIG.steps.map((step) => step.stepKey)).toEqual([
      ...ONBOARDING_STEP_KEYS,
    ]);
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

  it('refreshes the session when an edit changes the display name', async () => {
    // The name also lives on the session (account header, avatar initials, the
    // Profile tab), so those would keep showing the old one without this.
    mockSearchParams = { edit: '1' };
    serve({ display_name: 'Marcus Bell', onboarding_completed: true });

    const screen = await render(<NameStep />);
    await waitFor(() => expect(screen.getByDisplayValue('Marcus Bell')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Herbert'), 'Herbert L. Clarke');
    });
    await press(screen.getByRole('button', { name: 'Save' }));

    expect(patchBody()).toEqual({ display_name: 'Herbert L. Clarke' });
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('will not save the practice step before the stored answers load', async () => {
    // Every answer here has a default, so nothing else holds the CTA back:
    // saving early would PATCH those defaults over the stored ones and silently
    // switch off a configured reminder.
    mockSearchParams = { edit: '1' };
    const load = deferredGet({
      practice_days_goal: 3,
      reminder_time: '18:00:00',
      reminder_enabled: true,
    });

    const screen = await render(<PracticeStep />);
    await press(screen.getByRole('button', { name: 'Save' }));
    expect(requests().some(([method]) => method === 'PATCH')).toBe(false);

    await load();
    await press(screen.getByRole('button', { name: 'Save' }));

    expect(patchBody()).toEqual({
      practice_days_goal: 3,
      reminder_time: '18:00:00',
      reminder_enabled: true,
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('will not save the Clarke step before the stored answers load', async () => {
    // "New to Clarke" is a valid answer, so there is no empty state to gate on:
    // an early save would reset a chosen study to null.
    mockSearchParams = { edit: '1' };
    const load = deferredGet({ clarke_start_section: 7 });

    const screen = await render(<ClarkeStep />);
    await press(screen.getByRole('button', { name: 'Save' }));
    expect(requests().some(([method]) => method === 'PATCH')).toBe(false);

    await load();
    await press(screen.getByRole('button', { name: 'Save' }));

    expect(patchBody()).toEqual({ clarke_start_section: 7 });
  });

  it('drops the load-failure banner once a save comes back', async () => {
    // The layout holds one usePreferences for the whole run, so a banner left
    // standing would follow the user through every remaining step — over the
    // answers the save just brought back.
    mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === CONFIG_PATH) return ok(configWire());
      return init.method === 'GET'
        ? { ok: false, status: 500, json: async () => ({}) }
        : ok(wire({ display_name: 'Marcus Bell' }));
    });

    const screen = await render(<NameStep />);
    expect(await screen.findByText("We couldn't load your preferences.")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Herbert'), 'Marcus Bell');
    });
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByText("We couldn't load your preferences.")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/onboarding/instrument');
  });

  it('says so when the stored answers fail to load', async () => {
    // The step falls back to blank answers, which must not read as "you have
    // not answered this yet".
    mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === CONFIG_PATH) return ok(configWire());
      return init.method === 'GET'
        ? { ok: false, status: 500, json: async () => ({}) }
        : ok(wire());
    });

    const screen = await render(<InstrumentStep />);

    expect(await screen.findByText("We couldn't load your preferences.")).toBeTruthy();
  });

  it('keeps the user on the step and shows why when a save fails', async () => {
    mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === CONFIG_PATH) return ok(configWire());
      return init.method === 'PATCH'
        ? {
            ok: false,
            status: 400,
            json: async () => ({ instrument: ['Select a valid choice.'] }),
          }
        : ok(wire());
    });

    const screen = await render(<InstrumentStep />);

    await press(screen.getByRole('radio', { name: 'Trombone' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Select a valid choice.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('a configurable flow', () => {
  it('renders the copy the served variant carries', async () => {
    serve(
      {},
      DEFAULT_ONBOARDING_CONFIG.steps.map((step) =>
        step.stepKey === 'instrument'
          ? { ...step, copy: { ...step.copy, title: 'Which horn?', cta: 'Next up' } }
          : step,
      ),
    );

    const screen = await render(<InstrumentStep />);

    expect(await screen.findByText('Which horn?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next up' })).toBeTruthy();
  });

  it('offers only the answers the variant kept', async () => {
    serve(
      {},
      DEFAULT_ONBOARDING_CONFIG.steps.map((step) =>
        step.stepKey === 'instrument'
          ? { ...step, options: { instruments: [{ value: 'trumpet' }, { value: 'tuba' }] } }
          : step,
      ),
    );

    const screen = await render(<InstrumentStep />);

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Tuba' })).toBeTruthy());
    expect(screen.queryByRole('radio', { name: 'Flugelhorn' })).toBeNull();
  });

  it('skips a step the variant leaves out', async () => {
    serve({}, stepsWithout('experience'));

    const screen = await render(<InstrumentStep />);
    await press(screen.getByRole('radio', { name: 'Trumpet' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockPush).toHaveBeenCalledWith(STEP_ROUTES.goal);
  });

  it('counts the progress dots off the served flow, not off six', async () => {
    serve({}, stepsWithout('goal', 'practice', 'clarke'));

    const screen = await render(<InstrumentStep />);

    await waitFor(() => expect(screen.getByLabelText('Step 2 of 3')).toBeTruthy());
  });

  it('completes on the variant’s last step, wherever that falls', async () => {
    // `complete: true` is what lifts the route guard. Hard-coding it to the
    // Clarke step would strand every account on a flow that ends sooner.
    serve({}, stepsWithout('clarke'));

    const screen = await render(<PracticeStep />);
    await waitFor(() => expect(screen.getByRole('radio', { name: '7 days per week' })).toBeTruthy());
    await press(screen.getByRole('radio', { name: '7 days per week' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({
      practice_days_goal: 7,
      reminder_time: null,
      reminder_enabled: false,
      complete: true,
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('falls back to the bundled flow when the config cannot be fetched', async () => {
    // The hard-gate guarantee: onboarding must work with the config endpoint
    // down, or a bad deploy locks every new account out of the app.
    mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === CONFIG_PATH) throw new Error('offline');
      return ok(
        init.method === 'PATCH'
          ? wire(JSON.parse(String(init.body)) as Record<string, unknown>)
          : wire(),
      );
    });

    const screen = await render(<NameStep />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Herbert'), 'Marcus Bell');
    });
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(patchBody()).toEqual({ display_name: 'Marcus Bell' });
    expect(mockPush).toHaveBeenCalledWith(STEP_ROUTES.instrument);
  });

  it('falls back when the config arrives empty', async () => {
    serve({}, []);

    const screen = await render(<NameStep />);
    await waitFor(() => expect(screen.getByPlaceholderText('Herbert')).toBeTruthy());
    expect(screen.getByLabelText('Step 1 of 6')).toBeTruthy();
  });

  it('reports each step it shows', async () => {
    const screen = await render(<ExperienceStep />);
    await waitFor(() => expect(screen.getByText('7+ years')).toBeTruthy());

    expect(beacons()).toEqual(['experience']);
  });

  it('does not report an account-screen edit as flow progress', async () => {
    // Those are people changing one answer, not people moving through the
    // funnel; counting them would inflate every step's reach.
    mockSearchParams = { edit: '1' };

    const screen = await render(<ExperienceStep />);
    await waitFor(() => expect(screen.getByText('7+ years')).toBeTruthy());

    expect(beacons()).toEqual([]);
  });

  it('advances even when the beacon fails', async () => {
    mockAuthedRequest.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === CONFIG_PATH) return ok(configWire());
      if (path === VIEWS_PATH) throw new Error('beacon down');
      return ok(
        init.method === 'PATCH'
          ? wire(JSON.parse(String(init.body)) as Record<string, unknown>)
          : wire(),
      );
    });

    const screen = await render(<InstrumentStep />);
    await press(screen.getByRole('radio', { name: 'Trumpet' }));
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockPush).toHaveBeenCalledWith(STEP_ROUTES.experience);
  });

  it('still says Save on an edit when the variant renames the button', async () => {
    // A variant's "Let's go" would be plainly wrong on an account-screen edit.
    mockSearchParams = { edit: '1' };
    serve(
      { onboarding_completed: true },
      DEFAULT_ONBOARDING_CONFIG.steps.map((step) =>
        step.stepKey === 'goal' ? { ...step, copy: { ...step.copy, cta: "Let's go" } } : step,
      ),
    );

    const screen = await render(<InstrumentStep />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
  });

  it('still renders a step the variant dropped when it is reached to edit', async () => {
    // The account screen keeps every answer row: a player who answered a since
    // hidden question must still be able to change it.
    mockSearchParams = { edit: '1' };
    serve({ primary_goal: 'range', onboarding_completed: true }, stepsWithout('goal'));

    const screen = await render(<GoalStep />);

    expect(await screen.findByText('What are you working toward?')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Extend my range/, selected: true })).toBeTruthy(),
    );
  });
});
