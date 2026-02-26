const dotenv = require('dotenv');
dotenv.config({ path: '.env.test', override: true });

module.exports = {
    preset: 'ts-jest',
    globalSetup: './tests/jest.global-setup.ts',
    globalTeardown: './tests/jest.global-teardown.ts',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests/integration'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    moduleNameMapper: {
        '^@src/(.*)$': '<rootDir>/src/$1',
    },
};
