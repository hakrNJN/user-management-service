
const dotenv = require('dotenv');
dotenv.config({ path: '.env.test', override: true });

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/infrastructure/observability/tracer.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
