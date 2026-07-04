import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { tokenStore } from '@/services/auth';

import { __reset as resetSecureStore } from './mocks/expo-secure-store';

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
  const { status, user, signIn, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="user">{user?.email ?? 'none'}</Text>
      <Pressable testID="signin" onPress={() => signIn('player@example.com', 'longenough').catch(() => {})}>
        <Text>signin</Text>
      </Pressable>
      <Pressable testID="signout" onPress={() => signOut()}>
        <Text>signout</Text>
      </Pressable>
    </>
  );
}

beforeEach(async () => {
  resetSecureStore();
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
