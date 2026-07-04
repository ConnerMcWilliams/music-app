/**
 * Client-side form validation for the auth screens.
 *
 * This is a first line of defense for fast, friendly feedback — the Django
 * backend remains the authority (password strength, uniqueness, etc.). Keep the
 * rules lenient enough not to reject inputs the backend would accept.
 */

// Pragmatic email shape check (not full RFC 5322 — the backend validates too).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors Django's default MinimumLengthValidator (8) so client + server agree.
export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export function validateDisplayName(name: string): string | undefined {
  if (!name.trim()) return 'Display name is required.';
  return undefined;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | undefined {
  if (!confirmation) return 'Please confirm your password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return undefined;
}

export type LoginErrors = { email?: string; password?: string };
export type RegisterErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  const e = validateEmail(email);
  const p = validatePassword(password);
  if (e) errors.email = e;
  if (p) errors.password = p;
  return errors;
}

export function validateRegister(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): RegisterErrors {
  const errors: RegisterErrors = {};
  const n = validateDisplayName(input.displayName);
  const e = validateEmail(input.email);
  const p = validatePassword(input.password);
  const c = validatePasswordConfirmation(input.password, input.confirmPassword);
  if (n) errors.displayName = n;
  if (e) errors.email = e;
  if (p) errors.password = p;
  if (c) errors.confirmPassword = c;
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
