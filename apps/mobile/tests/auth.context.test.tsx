import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { tokenStore } from '@/services/auth';

import { __reset as resetSecureStore } from './mocks/expo-secure-store';
import { __reset as resetGoogleSignin, __setNextSignIn, GoogleSignin } from './mocks/google-signin';

// getGoogleIdToken() refuses to run without the web client ID configured.
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'test-web-client-id';

function makeResp(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

const PROFILE = { id: 'u1', email: 'player@example.com', display_name: 'Player', created_at: 't0' };
const SESSION = { access: 'access-1', refresh: 'refresh-1', user: PROFILE };

function Harness() {
  const { status, user, signIn, signInWithGoogle, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="user">{user?.email ?? 'none'}</Text>
      <Pressable testID="signin" onPress={() => signIn('player@example.com', 'longenough').catch(() => {})}>
        <Text>signin</Text>
      </Pressable>
      <Pressable testID="signin-google" onPress={() => signInWithGoogle().catch(() => {})}>
        <Text>google</Text>
      </Pressable>
      <Pressable testID="signout" onPress={() => signOut()}>
        <Text>signout</Text>
      </Pressable>
    </>
  );
}

beforeEach(async () => {
  resetSecureStore();
  resetGoogleSignin();
  await tokenStore.clear();
  jest.restoreAllMocks();
});

describe('AuthProvider', () => {
  it('resolves to unauthenticated when there is no stored session', async () => {
    globalThis.fetch = jest.fn();
    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));
    expect(getByTestId('user').props.children).toBe('none');
  });

  it('successful sign-in updates auth state to authenticated with the user', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, SESSION));
    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));

    await act(async () => {
      fireEvent.press(getByTestId('signin'));
    });

    await waitFor(() => expect(getByTestId('status').props.children).toBe('authenticated'));
    expect(getByTestId('user').props.children).toBe('player@example.com');
    expect(await tokenStore.getRefresh()).toBe('refresh-1');
  });

  it('restores a persisted session on mount', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, PROFILE));

    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => expect(getByTestId('status').props.children).toBe('authenticated'));
    expect(getByTestId('user').props.children).toBe('player@example.com');
  });

  it('Google sign-in exchanges the native ID token for an app session', async () => {
    // Mock module default: signIn() succeeds with 'mock-google-id-token'.
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, SESSION));
    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));

    await act(async () => {
      fireEvent.press(getByTestId('signin-google'));
    });

    await waitFor(() => expect(getByTestId('status').props.children).toBe('authenticated'));
    expect(getByTestId('user').props.children).toBe('player@example.com');
    expect(await tokenStore.getRefresh()).toBe('refresh-1');
    const body = (globalThis.fetch as jest.Mock).mock.calls[0][1].body as string;
    expect(JSON.parse(body)).toEqual({ id_token: 'mock-google-id-token' });
  });

  it('a dismissed Google picker changes nothing and calls no API', async () => {
    __setNextSignIn({ type: 'cancelled', data: null });
    globalThis.fetch = jest.fn();
    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));

    await act(async () => {
      fireEvent.press(getByTestId('signin-google'));
    });

    expect(getByTestId('status').props.children).toBe('unauthenticated');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await tokenStore.getRefresh()).toBeNull();
  });

  it('signOut also drops the Google SDK account so the picker reappears', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, PROFILE))
      .mockResolvedValueOnce(makeResp(205, null));
    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('authenticated'));

    await act(async () => {
      fireEvent.press(getByTestId('signout'));
    });

    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));
    expect(GoogleSignin.signOut).toHaveBeenCalled();
  });

  it('logout clears the user, resets state, and wipes secure storage', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    // First call: /me/ during restore. Second: /logout/.
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, PROFILE))
      .mockResolvedValueOnce(makeResp(205, null));

    const { getByTestId } = await render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('authenticated'));

    await act(async () => {
      fireEvent.press(getByTestId('signout'));
    });

    await waitFor(() => expect(getByTestId('status').props.children).toBe('unauthenticated'));
    expect(getByTestId('user').props.children).toBe('none');
    expect(await tokenStore.getRefresh()).toBeNull();
  });
});
