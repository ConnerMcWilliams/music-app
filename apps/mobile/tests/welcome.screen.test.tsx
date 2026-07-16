import { act, fireEvent, render } from '@testing-library/react-native';

import WelcomeScreen from '@/app/(auth)/welcome';
import { AuthError } from '@/services/auth';

// Mock the auth context so the screen is tested in isolation from the client.
const mockSignInWithGoogle = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signInWithGoogle: mockSignInWithGoogle }),
}));

// expo-router's <Link> needs a navigation context we don't mount here.
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn(), push: jest.fn() },
}));

beforeEach(() => {
  mockSignInWithGoogle.mockReset();
});

describe('WelcomeScreen', () => {
  it('renders the brand and all three entry points', async () => {
    const screen = await render(<WelcomeScreen />);

    expect(screen.getByText('Clarke Coach')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('Continue with email')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('starts the Google flow and shows no error when it resolves quietly', async () => {
    // A dismissed picker resolves with no state change — the screen must not
    // surface an error for it.
    mockSignInWithGoogle.mockResolvedValueOnce(undefined);
    const screen = await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Google sign-in failed. Please try again.')).toBeNull();
  });

  it('routes "Continue with email" to the register screen', async () => {
    const { router } = jest.requireMock('expo-router');
    const screen = await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with email'));
    });

    expect(router.push).toHaveBeenCalledWith('/register');
  });

  it('shows a friendly banner when Google sign-in fails', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(
      new AuthError('Google sign-in failed. Please try again.'),
    );
    const screen = await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(await screen.findByText('Google sign-in failed. Please try again.')).toBeTruthy();
  });
});
