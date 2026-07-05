import {
  identityForUser,
  initialsFromName,
  joinedLabel,
  nameForUser,
} from '@/lib/identity';
import type { AuthUser } from '@/services/auth';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  email: 'marcus.bell@example.com',
  displayName: 'Marcus Bell',
  createdAt: '2024-03-01T12:00:00Z',
  ...over,
});

describe('nameForUser', () => {
  it('prefers the display name', () => {
    expect(nameForUser(user())).toBe('Marcus Bell');
  });

  it('falls back to the email local part when no display name', () => {
    expect(nameForUser(user({ displayName: '' }))).toBe('marcus.bell');
    expect(nameForUser(user({ displayName: '   ' }))).toBe('marcus.bell');
  });

  it('falls back to "Player" when there is nothing usable', () => {
    expect(nameForUser({ displayName: '', email: '@example.com' })).toBe('Player');
  });
});

describe('initialsFromName', () => {
  it('takes the first and last words', () => {
    expect(initialsFromName('Marcus Bell')).toBe('MB');
    expect(initialsFromName('Ada Lovelace King')).toBe('AK');
  });

  it('takes the first two letters of a single word', () => {
    expect(initialsFromName('prince')).toBe('PR');
  });

  it('is empty for an empty name', () => {
    expect(initialsFromName('   ')).toBe('');
  });
});

describe('joinedLabel', () => {
  it('formats the join year', () => {
    expect(joinedLabel('2024-03-01T12:00:00Z')).toBe('Joined 2024');
  });

  it('is empty for a missing or invalid date', () => {
    expect(joinedLabel(undefined)).toBe('');
    expect(joinedLabel('not-a-date')).toBe('');
  });
});

describe('identityForUser', () => {
  it('combines name, initials, and join label', () => {
    expect(identityForUser(user())).toEqual({
      name: 'Marcus Bell',
      initials: 'MB',
      joined: 'Joined 2024',
    });
  });

  it('derives initials from the email fallback name', () => {
    const identity = identityForUser(user({ displayName: '' }));
    expect(identity.name).toBe('marcus.bell');
    // "marcus.bell" is one whitespace-delimited word → first two letters.
    expect(identity.initials).toBe('MA');
  });
});
