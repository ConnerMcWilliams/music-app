/**
 * Layout tokens — screen padding and border radii used across the mock screens.
 * Exact pixel values are still set inline where the design calls for a specific
 * one-off; these cover the common, repeated cases.
 */
export const Layout = {
  screenPaddingH: 22,
  screenGap: 16,
} as const;

export const Radius = {
  sm: 11,
  md: 14,
  lg: 18,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;
