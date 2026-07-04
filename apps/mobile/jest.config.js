/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Tests live outside the Expo Router `src/app/` directory so they are never
  // picked up as routes. See `tests/`.
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/dist-ci/'],
  // Mirror the `@/*` path aliases from tsconfig.json so imports resolve in tests.
  // The more specific `@/assets/*` mapping must come before the catch-all.
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // The native audio module has no JS runtime under Jest; use its shipped mock
    // so anything importing the metronome service loads without a native build.
    '^react-native-audio-api$':
      '<rootDir>/node_modules/react-native-audio-api/lib/commonjs/mock/index.js',
    // Same story for the recorder and file picker: native-only, so map to
    // hand-written mocks (they ship no Jest mocks of their own).
    '^expo-audio$': '<rootDir>/tests/mocks/expo-audio.ts',
    '^expo-document-picker$': '<rootDir>/tests/mocks/expo-document-picker.ts',
    // Secure token storage is native-only; use an in-memory fake under Jest.
    '^expo-secure-store$': '<rootDir>/tests/mocks/expo-secure-store.ts',
  },
  collectCoverageFrom: [
    'src/app/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    'src/hooks/**/*.{ts,tsx}',
    'src/lib/**/*.{ts,tsx}',
    'src/data/**/*.{ts,tsx}',
    'src/theme/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!src/app/_layout.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  clearMocks: true,
};
