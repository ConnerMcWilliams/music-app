import {
  validateDisplayName,
  validateLogin,
  validateRegister,
  MIN_PASSWORD_LENGTH,
} from '@/lib/auth/validation';

describe('login form validation', () => {
  it('requires email and password', () => {
    const errors = validateLogin('', '');
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });

  it('rejects a malformed email', () => {
    const errors = validateLogin('not-an-email', 'longenough');
    expect(errors.email).toMatch(/valid email/i);
    expect(errors.password).toBeUndefined();
  });

  it('accepts a well-formed email + password', () => {
    const errors = validateLogin('player@example.com', 'longenough');
    expect(errors).toEqual({});
  });
});

describe('registration form validation', () => {
  // Credentials only — the player's name moved to the first onboarding step.
  const base = {
    email: 'marcus@example.com',
    password: 'longenough1',
    confirmPassword: 'longenough1',
  };

  it('accepts a fully valid form', () => {
    expect(validateRegister(base)).toEqual({});
  });

  it('rejects a short password', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const errors = validateRegister({ ...base, password: short, confirmPassword: short });
    expect(errors.password).toMatch(/at least/i);
  });

  it('flags a password confirmation mismatch', () => {
    const errors = validateRegister({ ...base, confirmPassword: 'different1' });
    expect(errors.confirmPassword).toMatch(/do not match/i);
  });
});

describe('display name validation', () => {
  // Signup no longer asks for a name; this backs the onboarding name step.
  it('requires a non-blank name', () => {
    expect(validateDisplayName('  ')).toBeTruthy();
  });

  it('accepts a real name', () => {
    expect(validateDisplayName('Marcus Bell')).toBeUndefined();
  });
});
