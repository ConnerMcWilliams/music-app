/**
 * Font-family tokens. The string values are the names registered by
 * `useFonts` in the root layout (see `app/_layout.tsx`) and map 1:1 to the
 * @expo-google-fonts weight exports.
 *
 * Cormorant Garamond (serif) is used for display headings and large numbers.
 * Hanken Grotesk (sans) is used for body copy, labels, and UI text.
 */
export const Fonts = {
  serifMedium: 'CormorantGaramond_500Medium',
  serif: 'CormorantGaramond_600SemiBold',
  serifBold: 'CormorantGaramond_700Bold',
  serifItalic: 'CormorantGaramond_500Medium_Italic',

  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemibold: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
} as const;

export type AppFonts = typeof Fonts;
