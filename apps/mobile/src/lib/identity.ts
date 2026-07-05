/**
 * Derive the display identity (name, avatar initials, join label) shown on the
 * Today and Profile screens from the authenticated account.
 *
 * The backend account carries an email and an optional `displayName`, so these
 * helpers fall back to the email's local part when no display name is set, and
 * are dependency-free (no Intl) so they're deterministic and easy to test.
 */
import type { AuthUser } from '@/services/auth';

export interface Identity {
  /** Full name for headings, e.g. "Marcus Bell". */
  name: string;
  /** Up to two uppercase avatar initials, e.g. "MB". */
  initials: string;
  /** Pre-formatted membership label, e.g. "Joined 2024". */
  joined: string;
}

/** A human name for the account: the display name, or the email's local part. */
export function nameForUser(user: Pick<AuthUser, 'displayName' | 'email'>): string {
  const displayName = user.displayName?.trim();
  if (displayName) return displayName;
  const local = user.email.split('@')[0] ?? '';
  return local || 'Player';
}

/**
 * Up to two uppercase initials from a name: the first letters of its first and
 * last words, or the first two letters of a single word.
 */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** "Joined 2024" from an ISO timestamp; empty label if the date is unparseable. */
export function joinedLabel(createdAt: string | undefined): string {
  if (!createdAt) return '';
  const year = new Date(createdAt).getFullYear();
  return Number.isNaN(year) ? '' : `Joined ${year}`;
}

/** The full display identity for an authenticated user. */
export function identityForUser(user: AuthUser): Identity {
  const name = nameForUser(user);
  return {
    name,
    initials: initialsFromName(name),
    joined: joinedLabel(user.createdAt),
  };
}
