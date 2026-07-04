/**
 * Centralized, typed auth API client for the Django backend.
 *
 * Responsibilities:
 *  - attach the access token to authenticated requests;
 *  - on a 401 from an expired access token, refresh once and retry once
 *    (never more — a retried request that 401s again fails hard);
 *  - coordinate concurrent refreshes through a single in-flight promise so a
 *    burst of 401s triggers exactly one `/auth/refresh/` call;
 *  - clear the stored session when a refresh is definitively invalid;
 *  - distinguish auth failures (`AuthError`) from network failures
 *    (`NetworkError`) and never log token contents.
 *
 * The base URL comes from `API_BASE_URL` (Expo env / dev-host resolution in
 * `services/api.ts`) — no hard-coded localhost in production paths.
 */
import { API_BASE_URL } from '@/services/api';

import { AuthError, NetworkError, type FieldErrors } from './errors';
import { tokenStore } from './tokenStore';
import { type AuthUser, type SessionWire, toAuthUser, type SignUpInput } from './types';

const REQUEST_TIMEOUT_MS = 15_000;

/** fetch() wrapper that maps transport failures + timeouts to NetworkError. */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError (timeout) and TypeError (offline/DNS/unreachable) both land
    // here — the request never produced a usable HTTP response.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NetworkError('The request timed out. Please try again.');
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a JSON body defensively; a non-JSON body (e.g. HTML 500) is null. */
async function readJson(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // never surface raw server HTML to callers
  }
}

/** Flatten a DRF error body into a general message + per-field messages. */
function parseErrorBody(body: unknown): { message: string; fieldErrors?: FieldErrors } {
  if (!body || typeof body !== 'object') {
    return { message: 'Something went wrong. Please try again.' };
  }
  const obj = body as Record<string, unknown>;

  const first = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    return undefined;
  };

  if (typeof obj.detail === 'string') return { message: obj.detail };

  const nonField = first(obj.non_field_errors);
  const fieldErrors: FieldErrors = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'non_field_errors') continue;
    const msg = first(value);
    if (msg) fieldErrors[key] = msg;
  }

  const message =
    nonField ??
    Object.values(fieldErrors)[0] ??
    'Something went wrong. Please try again.';
  return {
    message,
    fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
  };
}

class AuthClient {
  private refreshInFlight: Promise<string> | null = null;

  private url(path: string): string {
    return `${API_BASE_URL}${path}`;
  }

  // ---- Public session operations -----------------------------------------

  async register(input: SignUpInput): Promise<AuthUser> {
    const resp = await safeFetch(this.url('/api/auth/register/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        display_name: input.displayName,
      }),
    });
    return this.consumeSession(resp);
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const resp = await safeFetch(this.url('/api/auth/login/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return this.consumeSession(resp);
  }

  async logout(): Promise<void> {
    const refresh = await tokenStore.getRefresh();
    const access = await tokenStore.getAccess();
    // Best-effort server-side revocation; local wipe happens regardless.
    if (refresh && access) {
      try {
        await safeFetch(this.url('/api/auth/logout/'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access}`,
          },
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // Offline logout still clears local credentials below.
      }
    }
    await tokenStore.clear();
  }

  /** GET the authenticated profile, refreshing the access token if needed. */
  async fetchMe(): Promise<AuthUser> {
    const resp = await this.authedFetch('/api/auth/me/', { method: 'GET' });
    const body = (await readJson(resp)) as SessionWire['user'] | null;
    if (!body || typeof body.id !== 'string') {
      throw new AuthError('Received an unexpected response from the server.');
    }
    return toAuthUser(body);
  }

  /**
   * Restore a session from stored credentials.
   * @returns the user if the session is valid, or null if there is no session
   *          / the session was invalid (in which case stored tokens are cleared).
   * @throws NetworkError on a transient connectivity failure (tokens are kept).
   */
  async restoreSession(): Promise<AuthUser | null> {
    const refresh = await tokenStore.getRefresh();
    if (!refresh) return null;
    try {
      return await this.fetchMe();
    } catch (err) {
      if (err instanceof AuthError && err.sessionInvalid) {
        return null; // tokens already cleared during refresh
      }
      if (err instanceof AuthError) {
        // Server rejected us for a non-transient reason — treat as logged out.
        await tokenStore.clear();
        return null;
      }
      throw err; // NetworkError — let the caller keep tokens and retry later
    }
  }

  // ---- Internals ----------------------------------------------------------

  private async consumeSession(resp: Response): Promise<AuthUser> {
    const body = await readJson(resp);
    if (!resp.ok) {
      const { message, fieldErrors } = parseErrorBody(body);
      throw new AuthError(message, { status: resp.status, fieldErrors });
    }
    const session = body as SessionWire | null;
    if (!session?.access || !session?.refresh || !session?.user) {
      throw new AuthError('Received an unexpected response from the server.');
    }
    await tokenStore.save({ access: session.access, refresh: session.refresh });
    return toAuthUser(session.user);
  }

  /** Authenticated request with a single refresh-and-retry on 401. */
  private async authedFetch(path: string, init: RequestInit): Promise<Response> {
    let access = await tokenStore.getAccess();
    if (!access) {
      // No access token cached — mint one from the refresh token up front.
      access = await this.coordinatedRefresh();
    }

    let resp = await safeFetch(this.url(path), this.withAuth(init, access));
    if (resp.status !== 401) return resp;

    // Access token likely expired: refresh once (coordinated) and retry once.
    access = await this.coordinatedRefresh();
    resp = await safeFetch(this.url(path), this.withAuth(init, access));
    if (resp.status === 401) {
      // Still unauthorized after a fresh token — the session is unusable.
      await tokenStore.clear();
      throw new AuthError('Your session has expired. Please sign in again.', {
        status: 401,
        sessionInvalid: true,
      });
    }
    return resp;
  }

  private withAuth(init: RequestInit, access: string): RequestInit {
    return { ...init, headers: { ...init.headers, Authorization: `Bearer ${access}` } };
  }

  /**
   * Refresh the access token, ensuring at most one refresh runs at a time.
   * Concurrent callers share the same in-flight promise.
   */
  private coordinatedRefresh(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string> {
    const refresh = await tokenStore.getRefresh();
    if (!refresh) {
      throw new AuthError('Your session has expired. Please sign in again.', {
        sessionInvalid: true,
      });
    }
    const resp = await safeFetch(this.url('/api/auth/refresh/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    const body = (await readJson(resp)) as { access?: string; refresh?: string } | null;
    if (!resp.ok || !body?.access) {
      // Definitively invalid/expired/revoked refresh token → clear the session.
      await tokenStore.clear();
      throw new AuthError('Your session has expired. Please sign in again.', {
        status: resp.status,
        sessionInvalid: true,
      });
    }
    // Rotation is enabled server-side, so a new refresh token comes back too.
    await tokenStore.save({ access: body.access, refresh: body.refresh ?? refresh });
    return body.access;
  }
}

/** Singleton client — one refresh coordinator for the whole app. */
export const authClient = new AuthClient();
