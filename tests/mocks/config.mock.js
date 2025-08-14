"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockConfigService = void 0;
// --- Mock Config Service ---
const mockConfigService = {
    // Existing mocks (slightly refined)
    get: jest.fn((key, defaultValue) => {
        // Simulate returning process.env first, then specific test defaults
        const envValue = process.env[key];
        if (envValue !== undefined)
            return envValue;
        // Provide common defaults often needed in tests
        const testDefaults = {
            NODE_ENV: 'test',
            PORT: '3001', // Default test port
            LOG_LEVEL: 'debug',
            AWS_REGION: 'us-east-1',
            COGNITO_USER_POOL_ID: 'test-pool-id',
            COGNITO_CLIENT_ID: 'test-client-id',
            COGNITO_ISSUER: 'http://test.issuer.local', // Use distinct test URLs
            COGNITO_JWKS_URI: 'http://test.jwks.local/.well-known/jwks.json',
            AUTHZ_TABLE_NAME: 'test-authz-table',
            CORS_ORIGIN: '*',
            // Add other common defaults
        };
        return testDefaults[key] !== undefined ? testDefaults[key] : defaultValue;
    }),
    getNumber: jest.fn((key, defaultValue) => {
        // Use the mock 'get' implementation
        const value = mockConfigService.getOrThrow(key);
        if (value === undefined || value === '') {
            return defaultValue;
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
            // In mock, maybe log a warning but return default if present
            if (defaultValue !== undefined) {
                // console.warn(`[MockConfig] getNumber: Value for "${key}" ("${value}") is not a number. Using default.`);
                return defaultValue;
            }
            // Return undefined if not parsable and no default
            return undefined;
        }
        return num;
    }),
    getBoolean: jest.fn((key, defaultValue) => {
        // Use the mock 'get' implementation
        const value = mockConfigService.getOrThrow(key);
        if (value === undefined || value === '') {
            return defaultValue;
        }
        const processedValue = String(value).trim().toLowerCase();
        if (processedValue === 'true' || processedValue === '1')
            return true;
        if (processedValue === 'false' || processedValue === '0')
            return false;
        return defaultValue; // Return default if not a valid boolean string
    }),
    // Implementations for *OrThrow methods
    getOrThrow: jest.fn((key) => {
        // Use the mock 'get' implementation (without default)
        const value = mockConfigService.get(key, undefined); // Explicitly request without default
        if (value === undefined || value === '') {
            // Simulate the real service's behavior by throwing
            throw new Error(`Configuration error: Required environment variable "${key}" is missing or empty.`);
        }
        return value;
    }),
    getNumberOrThrow: jest.fn((key) => {
        // Use the mock 'get' implementation (without default)
        const value = mockConfigService.get(key, undefined);
        if (value === undefined || value === '') {
            throw new Error(`Configuration error: Required environment variable "${key}" is missing or empty.`);
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
            throw new Error(`Configuration error: Environment variable "${key}" must be a valid number (value: "${value}").`);
        }
        return num;
    }),
    getBooleanOrThrow: jest.fn((key) => {
        // Use the mock 'get' implementation (without default)
        const value = mockConfigService.get(key, undefined);
        if (value === undefined || value === '') {
            throw new Error(`Configuration error: Required environment variable "${key}" is missing or empty.`);
        }
        const processedValue = String(value).trim().toLowerCase();
        if (processedValue === 'true' || processedValue === '1')
            return true;
        if (processedValue === 'false' || processedValue === '0')
            return false;
        throw new Error(`Configuration error: Environment variable "${key}" must be a valid boolean (value: "${value}"). Expected 'true', 'false', '1', or '0'.`);
    }),
    // Other existing methods
    isDevelopment: jest.fn(() => mockConfigService.getOrThrow('NODE_ENV') === 'development'), // Dynamically check mock NODE_ENV
    isProduction: jest.fn(() => mockConfigService.getOrThrow('NODE_ENV') === 'production'),
    isTest: jest.fn(() => mockConfigService.getOrThrow('NODE_ENV') === 'test'), // Default to true based on common test defaults
    getAllConfig: jest.fn(() => {
        // Simulate basic filtering for tests if needed, or return a fixed object
        return {
            NODE_ENV: 'test',
            PORT: '3001',
            LOG_LEVEL: 'debug',
            COGNITO_CLIENT_ID: 'test-client-id',
            // ... other non-sensitive defaults
        };
    }),
    has: jest.fn((key) => {
        // Check if get would return *something* other than undefined
        return mockConfigService.get(key, undefined) !== undefined;
    }),
    // reloadConfig: jest.fn(), // Omitted as it was removed from the actual implementation
};
exports.mockConfigService = mockConfigService;
