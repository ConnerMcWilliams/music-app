/**
 * Clarke Coach color tokens.
 *
 * Pulled directly from the Claude Design handoff (`Clarke Coach.dc.html`) so the
 * mock screens match the mockup. Single source of truth — adjust here, not inline.
 */
export const Colors = {
  // App background gradient (dark navy phone surface)
  bgGradient: ['#0F1E33', '#0A1322', '#091120'] as const,
  bg: '#0A1322',

  // Card / surface fills
  surface: '#16273C',
  surfaceAlt: '#1A2C44',
  streakGradient: ['#1A2C44', '#16263B'] as const,
  activeCardGradient: ['#1C2E47', '#16273C'] as const,
  darkButtonGradient: ['#22364F', '#16273C'] as const,
  avatarGradient: ['#22354E', '#16273C'] as const,
  ringTrack: 'rgba(255,255,255,.08)',
  ringCenter: '#13233A',
  scoreRingCenter: '#0E1C30',

  // Cream "paper" cards (hero study, sheet music, feedback)
  creamGradient: ['#F8F2E3', '#F2E9D4'] as const,
  heroGradient: ['#F8F2E3', '#F3EAD6'] as const,

  // Gold accent
  gold: '#E4C57E',
  goldDeep: '#C9A24A',
  goldGradient: ['#E4C57E', '#C9A24A'] as const,
  goldGlow: '#F0D58C',
  goldLabel: '#B08A2E',
  goldMuted: '#9A8A66',

  // Text
  textCream: '#F4EBD7',
  textOnCream: '#16273C',
  textOnCreamSoft: '#3A4658',
  textInk: '#1B2F49',
  textInkSoft: '#2C3A4E',
  textMuted: '#7E93AC',
  textMutedDim: '#6B7E96',
  textMutedDark: '#5E6F86',
  textOnCreamMuted: '#6A7280',
  chipText: '#A9BACD',
  iconLight: '#C9D3DF',
  lockedText: '#B8C3D0',

  // Status
  good: '#9FBE93', // score >= 90 highlight

  // Borders / hairlines
  goldBorder: 'rgba(201,162,74,.22)',
  goldBorderStrong: 'rgba(201,162,74,.4)',
  goldBorderSoft: 'rgba(201,162,74,.16)',
  mutedBorder: 'rgba(126,147,172,.13)',
  mutedBorderSoft: 'rgba(126,147,172,.1)',
  mutedBorderAlt: 'rgba(126,147,172,.18)',
  hairlineOnCream: 'rgba(27,47,73,.1)',
  trackBar: 'rgba(126,147,172,.16)',

  // Tab bar
  tabBar: 'rgba(7,12,20,.92)',
  tabInactive: '#6B7E96',
} as const;

export type AppColors = typeof Colors;
