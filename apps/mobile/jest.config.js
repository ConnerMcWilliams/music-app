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
  },
  collectCoverageFrom: [
    'src/app/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    'src/hooks/**/*.{ts,tsx}',
    'src/data/**/*.{ts,tsx}',
    'src/theme/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!src/app/_layout.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  clearMocks: true,
};
