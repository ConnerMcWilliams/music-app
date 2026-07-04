import {
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
  const base = {
    displayName: 'Marcus Bell',
    email: 'marcus@example.com',
    password: 'longenough1',
    confirmPassword: 'longenough1',
  };

  it('accepts a fully valid form', () => {
    expect(validateRegister(base)).toEqual({});
  });

  it('requires a display name', () => {
    expect(validateRegister({ ...base, displayName: '  ' }).displayName).toBeTruthy();
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
