/**
 * Manual Jest mock for `expo-document-picker` (mapped via jest.config.js).
 * Defaults to "user canceled"; tests override per case.
 */
export const getDocumentAsync = jest.fn(async () => ({
  canceled: true as const,
  assets: null,
}));
