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
  /**
   * Whether the user has finished onboarding. Rides on every session payload so
   * the root route guard can choose between the tabs and the onboarding flow
   * without a second request. False for accounts created before onboarding existed.
   */
  onboardingCompleted: boolean;
}

/** Inputs for creating an account. */
export interface SignUpInput {
  email: string;
  password: string;
  /** Optional: the name is asked for in onboarding, not on the signup form. */
  displayName?: string;
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
  onboarding_completed: boolean;
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
    // Treat a missing flag as "not onboarded" so a stale/legacy payload sends the
    // user through the flow rather than silently skipping it.
    onboardingCompleted: wire.onboarding_completed ?? false,
  };
}
