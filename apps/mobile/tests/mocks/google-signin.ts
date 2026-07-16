/**
 * In-memory mock of @react-native-google-signin/google-signin for tests. The
 * real module needs a native build (and a rebuilt dev client), which isn't
 * present under Jest. Tests queue the next `signIn()` outcome with
 * `__setNextSignIn()` and clear module state via `__reset()` — `clearMocks`
 * resets the jest.fn()s but not this module-level queue.
 */
type SignInResult =
  | { type: 'success'; data: { idToken: string | null } }
  | { type: 'cancelled'; data: null };

const DEFAULT_SUCCESS: SignInResult = {
  type: 'success',
  data: { idToken: 'mock-google-id-token' },
};

let nextSignIn: SignInResult | Error = DEFAULT_SUCCESS;

/** Queue the outcome of the next GoogleSignin.signIn() call (an Error rejects). */
export function __setNextSignIn(result: SignInResult | Error): void {
  nextSignIn = result;
}

/** Test-only helper to restore the default successful sign-in between tests. */
export function __reset(): void {
  nextSignIn = DEFAULT_SUCCESS;
}

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
} as const;

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async (): Promise<SignInResult> => {
    if (nextSignIn instanceof Error) throw nextSignIn;
    return nextSignIn;
  }),
  signOut: jest.fn(async () => null),
};

export function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string';
}
