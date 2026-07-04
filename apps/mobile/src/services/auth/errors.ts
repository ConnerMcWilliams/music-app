/**
 * Auth error taxonomy + user-facing message mapping.
 *
 * Two failure modes are kept distinct so the app can react differently:
 *  - `AuthError` — the request reached the server and it rejected the
 *    credentials/session (invalid login, expired refresh, validation errors).
 *  - `NetworkError` — the request never got a usable answer (offline, DNS,
 *    timeout, unreachable host, malformed/HTML response). The session is NOT
 *    cleared on these, because the credentials may still be valid.
 *
 * Raw server bodies and stack traces never reach the UI — only the curated
 * `message` (and, for validation, `fieldErrors`).
 */

export type FieldErrors = Record<string, string>;

export class AuthError extends Error {
  /** HTTP status, when the failure came from a server response. */
  readonly status?: number;
  /** Per-field validation messages, keyed by field name. */
  readonly fieldErrors?: FieldErrors;
  /** True when the stored session is definitively invalid and must be cleared. */
  readonly sessionInvalid: boolean;

  constructor(
    message: string,
    opts: { status?: number; fieldErrors?: FieldErrors; sessionInvalid?: boolean } = {},
  ) {
    super(message);
    this.name = 'AuthError';
    this.status = opts.status;
    this.fieldErrors = opts.fieldErrors;
    this.sessionInvalid = opts.sessionInvalid ?? false;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Can’t reach the server. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** True for a timeout / offline / unreachable-host failure. */
export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

/**
 * Turn any thrown value into a readable, user-safe message. Never surfaces raw
 * stack traces or server HTML.
 */
export function messageForError(err: unknown): string {
  if (err instanceof AuthError || err instanceof NetworkError) return err.message;
  return 'Something went wrong. Please try again.';
}
