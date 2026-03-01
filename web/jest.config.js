/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  transform: {
    '^.+\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: [
    '**/tests/unit/**/*.test.(ts|tsx)'
  ],
  setupFiles: [
    '<rootDir>/tests/unit/setup.js'
  ],
  globals: {
    'ts-jest': {
      useESM: true,
    }
  }
};
