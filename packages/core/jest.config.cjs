/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  setupFiles: ['<rootDir>/jest.env.cjs'],
  moduleNameMapper: {
    '^@vouch/types$': '<rootDir>/../types/src/index.ts',
    '^@vouch/config/env$': '<rootDir>/../config/src/env.ts',
    '^@vouch/config$': '<rootDir>/../config/src/index.ts',
  },
};
