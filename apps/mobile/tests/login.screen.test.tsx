import { act, fireEvent, render } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import { AuthError } from '@/services/auth';

// Mock the auth context so the screen is tested in isolation from the client.
const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn, signInWithGoogle: mockSignInWithGoogle }),
}));

// expo-router's <Link> needs a navigation context we don't mount here.
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn(), push: jest.fn() },
}));

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignInWithGoogle.mockReset();
});

describe('LoginScreen', () => {
  it('starts the Google flow from the Google button without touching the form', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce(undefined);
    const screen = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows a banner when Google sign-in fails', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(
      new AuthError('Google sign-in failed. Please try again.'),
    );
    const screen = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(await screen.findByText('Google sign-in failed. Please try again.')).toBeTruthy();
  });

  it('shows inline validation errors and does not submit an empty form', async () => {
    const screen = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Sign in'));
    });

    expect(await screen.findByText('Email is required.')).toBeTruthy();
    expect(await screen.findByText('Password is required.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits valid credentials via the auth context', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const screen = await render(<LoginScreen />);

    const email = await screen.findByPlaceholderText('you@example.com');
    const password = await screen.findByPlaceholderText('Your password');
    await act(async () => {
      fireEvent.changeText(email, '  player@example.com  ');
      fireEvent.changeText(password, 'longenough');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Sign in'));
    });

    // Email is trimmed before submission.
    expect(mockSignIn).toHaveBeenCalledWith('player@example.com', 'longenough');
  });

  it('displays a generic error when the server rejects the login', async () => {
    mockSignIn.mockRejectedValueOnce(new AuthError('Invalid email or password.'));
    const screen = await render(<LoginScreen />);

    const email = await screen.findByPlaceholderText('you@example.com');
    const password = await screen.findByPlaceholderText('Your password');
    await act(async () => {
      fireEvent.changeText(email, 'player@example.com');
      fireEvent.changeText(password, 'longenough');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Sign in'));
    });

    expect(await screen.findByText('Invalid email or password.')).toBeTruthy();
  });
});
