/**
 * Types for the authentication layer. These mirror the Django backend's wire
 * format (snake_case) at the edges and expose camelCase to the rest of the app.
 */

/** Safe, app-facing account profile — never carries credentials or secrets. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

/** Inputs for creating an account. */
export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

/** Access + refresh JWT pair as stored/transported. */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** Backend `user` object (snake_case wire format). */
export interface UserWire {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

/** Backend register/login response. */
export interface SessionWire extends TokenPair {
  user: UserWire;
}

export function toAuthUser(wire: UserWire): AuthUser {
  return {
    id: wire.id,
    email: wire.email,
    displayName: wire.display_name,
    createdAt: wire.created_at,
  };
}
