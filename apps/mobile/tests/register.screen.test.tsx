import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';

import RegisterScreen from '@/app/(auth)/register';
import { AuthError } from '@/services/auth';

const mockSignUp = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn(), push: jest.fn() },
}));

async function fillValid(screen: RenderResult) {
  const name = await screen.findByPlaceholderText('e.g. Marcus Bell');
  const email = await screen.findByPlaceholderText('you@example.com');
  const password = await screen.findByPlaceholderText('At least 8 characters');
  const confirm = await screen.findByPlaceholderText('Re-enter your password');
  await act(async () => {
    fireEvent.changeText(name, 'Marcus Bell');
    fireEvent.changeText(email, 'marcus@example.com');
    fireEvent.changeText(password, 'longenough1');
    fireEvent.changeText(confirm, 'longenough1');
  });
  return { name, email, password, confirm };
}

async function submit(screen: RenderResult) {
  // The heading and the CTA both read "Create account"; target the button.
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  });
}

beforeEach(() => {
  mockSignUp.mockReset();
});

describe('RegisterScreen', () => {
  it('validates all fields and blocks submission when empty', async () => {
    const screen = await render(<RegisterScreen />);

    await submit(screen);

    expect(await screen.findByText('Display name is required.')).toBeTruthy();
    expect(await screen.findByText('Email is required.')).toBeTruthy();
    expect(await screen.findByText('Password is required.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('flags a password confirmation mismatch without calling the backend', async () => {
    const screen = await render(<RegisterScreen />);
    const { confirm } = await fillValid(screen);
    await act(async () => {
      fireEvent.changeText(confirm, 'different1');
    });

    await submit(screen);

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits a valid form with trimmed values', async () => {
    mockSignUp.mockResolvedValueOnce(undefined);
    const screen = await render(<RegisterScreen />);
    await fillValid(screen);

    await submit(screen);

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'marcus@example.com',
      password: 'longenough1',
      displayName: 'Marcus Bell',
    });
  });

  it('surfaces a backend duplicate-email error inline on the email field', async () => {
    mockSignUp.mockRejectedValueOnce(
      new AuthError('An account with this email already exists.', {
        status: 400,
        fieldErrors: { email: 'An account with this email already exists.' },
      }),
    );
    const screen = await render(<RegisterScreen />);
    await fillValid(screen);

    await submit(screen);

    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
  });
});
