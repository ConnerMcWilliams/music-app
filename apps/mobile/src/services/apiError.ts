/**
 * Error type for non-auth API failures: the request reached the backend and it
 * answered with a non-2xx status. `message` is the server's own (user-safe)
 * explanation when one was sent — e.g. a serializer rejection like "Audio file
 * is too large (max 30 MB)." — so screens can show the real reason instead of
 * a generic failure line.
 *
 * Kept in its own module (not `services/api.ts`) so screens can `instanceof`
 * it even when tests mock the api module.
 */
export class ApiError extends Error {
  /** HTTP status of the failed response. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
