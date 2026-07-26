import { authClient, NetworkError, tokenStore } from '@/services/auth';

import { __reset as resetSecureStore } from './mocks/expo-secure-store';

/** Minimal Response-like stub matching what the client reads (ok/status/text). */
function makeResp(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

const PROFILE = {
  id: 'u1',
  email: 'player@example.com',
  display_name: 'Player',
  created_at: 't0',
  onboarding_completed: true,
};

const SESSION = {
  access: 'access-1',
  refresh: 'refresh-1',
  user: PROFILE,
};

beforeEach(async () => {
  resetSecureStore();
  await tokenStore.clear();
  jest.restoreAllMocks();
});

describe('AuthClient.login', () => {
  it('stores tokens and returns the user on success', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, SESSION));

    const user = await authClient.login('player@example.com', 'longenough');

    expect(user).toEqual({
      id: 'u1',
      email: 'player@example.com',
      displayName: 'Player',
      createdAt: 't0',
      onboardingCompleted: true,
    });
    expect(await tokenStore.getAccess()).toBe('access-1');
    expect(await tokenStore.getRefresh()).toBe('refresh-1');
  });

  it('treats a missing onboarding_completed as not-yet-onboarded', async () => {
    // Grandfathering: accounts created before preferences existed have no row,
    // so the key can be absent — that must route the user into onboarding, not
    // silently past it.
    const { onboarding_completed: _omitted, ...legacy } = PROFILE;
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(makeResp(200, { ...SESSION, user: legacy }));

    const user = await authClient.login('player@example.com', 'longenough');

    expect(user.onboardingCompleted).toBe(false);
  });

  it('throws a generic AuthError on invalid credentials', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(makeResp(400, { non_field_errors: ['Invalid email or password.'] }));

    await expect(authClient.login('player@example.com', 'wrong')).rejects.toMatchObject({
      name: 'AuthError',
      message: 'Invalid email or password.',
    });
    // No tokens are persisted on a failed login.
    expect(await tokenStore.getAccess()).toBeNull();
  });

  it('distinguishes a network failure from an auth failure', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(authClient.login('player@example.com', 'longenough')).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});

describe('AuthClient.loginWithGoogle', () => {
  it('POSTs the id_token to /api/auth/google/ and stores the session', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, SESSION));

    const user = await authClient.loginWithGoogle('google-id-token');

    expect(user.email).toBe('player@example.com');
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('/api/auth/google/');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      id_token: 'google-id-token',
    });
    expect(await tokenStore.getAccess()).toBe('access-1');
    expect(await tokenStore.getRefresh()).toBe('refresh-1');
  });

  it('surfaces the backend rejection as an AuthError with its message', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        makeResp(400, { non_field_errors: ['Google sign-in failed. Please try again.'] }),
      );

    await expect(authClient.loginWithGoogle('bad-token')).rejects.toMatchObject({
      name: 'AuthError',
      message: 'Google sign-in failed. Please try again.',
    });
    // No tokens are persisted on a failed Google sign-in.
    expect(await tokenStore.getAccess()).toBeNull();
  });
});

describe('AuthClient.restoreSession', () => {
  it('returns null and makes no request when there is no stored session', async () => {
    globalThis.fetch = jest.fn();
    const result = await authClient.restoreSession();
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('restores the user from a valid stored session', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    globalThis.fetch = jest.fn().mockResolvedValue(makeResp(200, PROFILE));

    const user = await authClient.restoreSession();
    expect(user?.email).toBe('player@example.com');
  });

  it('clears invalid stored credentials and returns null when refresh is rejected', async () => {
    await tokenStore.save({ access: 'stale', refresh: 'bad-refresh' });
    // /me/ -> 401 (expired access), then /refresh/ -> 401 (invalid refresh).
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeResp(401, { detail: 'token expired' }))
      .mockResolvedValueOnce(makeResp(401, { detail: 'invalid refresh' }));

    const result = await authClient.restoreSession();

    expect(result).toBeNull();
    // Definitively invalid session -> secure storage wiped.
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });

  it('refreshes an expired access token and retries the original request once', async () => {
    await tokenStore.save({ access: 'stale', refresh: 'refresh-1' });
    globalThis.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const url = String(_url);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (url.includes('/refresh/')) {
        return makeResp(200, { access: 'access-2', refresh: 'refresh-2' });
      }
      // /me/: only the refreshed token is accepted.
      return auth === 'Bearer access-2'
        ? makeResp(200, PROFILE)
        : makeResp(401, { detail: 'expired' });
    }) as unknown as typeof fetch;

    const user = await authClient.restoreSession();

    expect(user?.email).toBe('player@example.com');
    // Rotated tokens are persisted.
    expect(await tokenStore.getAccess()).toBe('access-2');
    expect(await tokenStore.getRefresh()).toBe('refresh-2');
  });

  it('keeps stored tokens on a transient network failure during restore', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('offline'));

    await expect(authClient.restoreSession()).rejects.toBeInstanceOf(NetworkError);
    // Tokens are NOT cleared — the session may still be valid once back online.
    expect(await tokenStore.getRefresh()).toBe('refresh-1');
  });
});

describe('AuthClient concurrent refresh coordination', () => {
  it('performs exactly one refresh for a burst of simultaneous 401s', async () => {
    await tokenStore.save({ access: 'stale', refresh: 'refresh-1' });
    let refreshCalls = 0;
    globalThis.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const url = String(_url);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (url.includes('/refresh/')) {
        refreshCalls += 1;
        // Small delay so both callers land on the same in-flight promise.
        await new Promise((r) => setTimeout(r, 5));
        return makeResp(200, { access: 'access-2', refresh: 'refresh-2' });
      }
      return auth === 'Bearer access-2'
        ? makeResp(200, PROFILE)
        : makeResp(401, { detail: 'expired' });
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([authClient.fetchMe(), authClient.fetchMe()]);

    expect(a.email).toBe('player@example.com');
    expect(b.email).toBe('player@example.com');
    expect(refreshCalls).toBe(1);
  });
});

describe('AuthClient.logout', () => {
  it('revokes the refresh token and clears local storage', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    const fetchMock = jest.fn().mockResolvedValue(makeResp(205, null));
    globalThis.fetch = fetchMock;

    await authClient.logout();

    // Best-effort server revocation was attempted with the refresh token.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout/'),
      expect.objectContaining({ method: 'POST' }),
    );
    // Local credentials are gone regardless.
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });

  it('still clears local storage when the server call fails (offline)', async () => {
    await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('offline'));

    await authClient.logout();

    expect(await tokenStore.getRefresh()).toBeNull();
  });
});
