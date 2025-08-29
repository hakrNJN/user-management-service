
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/e2e'],
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
  },
  testRegex: '.e2e.spec.ts$',
};
