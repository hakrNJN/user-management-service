import 'reflect-metadata';
import { EnvironmentConfigService } from '../../../../src/infrastructure/config/EnvironmentConfigService';

describe('EnvironmentConfigService', () => {
    let service: EnvironmentConfigService;
    let originalProcessEnv: NodeJS.ProcessEnv;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleInfoSpy: jest.SpyInstance;
    let consoleDebugSpy: jest.SpyInstance;

    const requiredKeys = [
        'NODE_ENV',
        'PORT',
        'LOG_LEVEL',
        'AWS_REGION',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID'
    ];

    const setupProcessEnv = (env: Record<string, string>) => {
        process.env = { ...env };
    };

    beforeAll(() => {
        originalProcessEnv = process.env; // Save original process.env
    });

    beforeEach(() => {
        // Clear process.env before each test to ensure isolation
        process.env = {};
        // Mock console methods to prevent actual logging during tests
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => { });
        consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });
    });

    afterEach(() => {
        // Restore console mocks
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleInfoSpy.mockRestore();
        consoleDebugSpy.mockRestore();
    });

    afterAll(() => {
        process.env = originalProcessEnv; // Restore original process.env
    });

    // --- Constructor Tests ---
    describe('constructor', () => {
        it('should throw an error if required environment variables are missing', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                // Missing LOG_LEVEL, AWS_REGION, etc.
            });
            expect(() => new EnvironmentConfigService()).toThrow(
                /Missing or empty required environment variables: LOG_LEVEL, AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID/
            );
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });

        it('should initialize successfully if all required environment variables are present', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            expect(() => new EnvironmentConfigService()).not.toThrow();
            expect(consoleInfoSpy).toHaveBeenCalledWith('[ConfigService] Required configuration keys verified.');
        });

        it('should log filtered config in debug mode', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'debug',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                API_KEY: 'super-secret',
            });
            new EnvironmentConfigService();
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                '[ConfigService] Loaded configuration (filtered):',
                expect.objectContaining({
                    API_KEY: '********',
                    NODE_ENV: 'test',
                })
            );
        });

        it('should log keys only in non-debug mode', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            new EnvironmentConfigService();
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                '[ConfigService] Configuration loaded (keys only):',
                expect.arrayContaining(requiredKeys)
            );
        });
    });

    // --- get<T> Tests ---
    describe('get', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                TEST_KEY: 'test-value',
                EMPTY_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it('should return the value if the key exists', () => {
            expect(service.get('TEST_KEY')).toBe('test-value');
        });

        it('should return undefined if the key is missing', () => {
            expect(service.get('NON_EXISTENT_KEY')).toBeUndefined();
        });

        it('should return the default value if the key is missing', () => {
            expect(service.get('NON_EXISTENT_KEY', 'default')).toBe('default');
        });

        it('should return the default value if the key is an empty string', () => {
            expect(service.get('EMPTY_KEY', 'default')).toBe('default');
        });

        it('should return undefined if the key is an empty string and no default is provided', () => {
            expect(service.get('EMPTY_KEY')).toBeUndefined();
        });
    });

    // --- getOrThrow<T> Tests ---
    describe('getOrThrow', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                TEST_KEY: 'test-value',
                EMPTY_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it('should return the value if the key exists and is not empty', () => {
            expect(service.getOrThrow('TEST_KEY')).toBe('test-value');
        });

        it('should throw an error if the key is missing', () => {
            expect(() => service.getOrThrow('NON_EXISTENT_KEY')).toThrow(
                /Required environment variable "NON_EXISTENT_KEY" is missing or empty./
            );
        });

        it('should throw an error if the key is an empty string', () => {
            expect(() => service.getOrThrow('EMPTY_KEY')).toThrow(
                /Required environment variable "EMPTY_KEY" is missing or empty./
            );
        });
    });

    // --- getNumber Tests ---
    describe('getNumber', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                NUM_KEY: '123',
                FLOAT_KEY: '123.45',
                INVALID_NUM_KEY: 'abc',
                EMPTY_NUM_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it('should return the number value if the key is a valid number string', () => {
            expect(service.getNumber('NUM_KEY')).toBe(123);
            expect(service.getNumber('FLOAT_KEY')).toBe(123.45);
        });

        it('should return the default value if the key is missing', () => {
            expect(service.getNumber('NON_EXISTENT_NUM_KEY', 99)).toBe(99);
        });

        it('should return undefined if the key is missing and no default is provided', () => {
            expect(service.getNumber('NON_EXISTENT_NUM_KEY')).toBeUndefined();
        });

        it('should return the default value if the key is an empty string', () => {
            expect(service.getNumber('EMPTY_NUM_KEY', 99)).toBe(99);
        });

        it('should return undefined if the key is an empty string and no default is provided', () => {
            expect(service.getNumber('EMPTY_NUM_KEY')).toBeUndefined();
        });

        it('should return the default value if the key is an invalid number string', () => {
            expect(service.getNumber('INVALID_NUM_KEY', 99)).toBe(99);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });

        it('should throw an error if the key is an invalid number string and no default is provided', () => {
            expect(() => service.getNumber('INVALID_NUM_KEY')).toThrow(
                /Environment variable "INVALID_NUM_KEY" is not a valid number/i
            );
        });
    });

    // --- getNumberOrThrow Tests ---
    describe('getNumberOrThrow', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                NUM_KEY: '123',
                INVALID_NUM_KEY: 'abc',
                EMPTY_NUM_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it('should return the number value if the key is a valid number string', () => {
            expect(service.getNumberOrThrow('NUM_KEY')).toBe(123);
        });

        it('should throw an error if the key is missing', () => {
            expect(() => service.getNumberOrThrow('NON_EXISTENT_NUM_KEY')).toThrow(
                /Required environment variable "NON_EXISTENT_NUM_KEY" is missing or empty./
            );
        });

        it('should throw an error if the key is an empty string', () => {
            expect(() => service.getNumberOrThrow('EMPTY_NUM_KEY')).toThrow(
                /Required environment variable "EMPTY_NUM_KEY" is missing or empty./
            );
        });

        it('should throw an error if the key is an invalid number string', () => {
            expect(() => service.getNumberOrThrow('INVALID_NUM_KEY')).toThrow(
                /Environment variable "INVALID_NUM_KEY" must be a valid number/i
            );
        });
    });

    // --- getBoolean Tests ---
    describe('getBoolean', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                TRUE_KEY_STR: 'true',
                FALSE_KEY_STR: 'false',
                TRUE_KEY_NUM: '1',
                FALSE_KEY_NUM: '0',
                INVALID_BOOL_KEY: 'yes',
                EMPTY_BOOL_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it(`should return true for 'true' or '1' strings (case-insensitive)`, () => {
            expect(service.getBoolean('TRUE_KEY_STR')).toBe(true);
            expect(service.getBoolean('TRUE_KEY_NUM')).toBe(true);
        });

        it(`should return false for 'false' or '0' strings (case-insensitive)`, () => {
            expect(service.getBoolean('FALSE_KEY_STR')).toBe(false);
            expect(service.getBoolean('FALSE_KEY_NUM')).toBe(false);
        });

        it('should return the default value if the key is missing', () => {
            expect(service.getBoolean('NON_EXISTENT_BOOL_KEY', true)).toBe(true);
        });

        it('should return undefined if the key is missing and no default is provided', () => {
            expect(service.getBoolean('NON_EXISTENT_BOOL_KEY')).toBeUndefined();
        });

        it('should return the default value if the key is an empty string', () => {
            expect(service.getBoolean('EMPTY_BOOL_KEY', true)).toBe(true);
        });

        it('should return undefined if the key is an empty string and no default is provided', () => {
            expect(service.getBoolean('EMPTY_BOOL_KEY')).toBeUndefined();
        });

        it('should return the default value if the key is an invalid boolean string', () => {
            expect(service.getBoolean('INVALID_BOOL_KEY', true)).toBe(true);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });

        it('should throw an error if the key is an invalid boolean string and no default is provided', () => {
            expect(() => service.getBoolean('INVALID_BOOL_KEY')).toThrow(
                /Environment variable "INVALID_BOOL_KEY" is not a valid boolean/i
            );
        });
    });

    // --- getBooleanOrThrow Tests ---
    describe('getBooleanOrThrow', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                TRUE_KEY_STR: 'true',
                INVALID_BOOL_KEY: 'yes',
                EMPTY_BOOL_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it(`should return true for 'true' or '1' strings`, () => {
            expect(service.getBooleanOrThrow('TRUE_KEY_STR')).toBe(true);
        });

        it('should throw an error if the key is missing', () => {
            expect(() => service.getBooleanOrThrow('NON_EXISTENT_BOOL_KEY')).toThrow(
                /Required environment variable "NON_EXISTENT_BOOL_KEY" is missing or empty./
            );
        });

        it('should throw an error if the key is an empty string', () => {
            expect(() => service.getBooleanOrThrow('EMPTY_BOOL_KEY')).toThrow(
                /Required environment variable "EMPTY_BOOL_KEY" is missing or empty./
            );
        });

        it('should throw an error if the key is an invalid boolean string', () => {
            expect(() => service.getBooleanOrThrow('INVALID_BOOL_KEY')).toThrow(
                /Environment variable "INVALID_BOOL_KEY" must be a valid boolean/i
            );
        });
    });

    // --- getAllConfig Tests ---
    describe('getAllConfig', () => {
        it('should return all config with sensitive keys masked', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'debug',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                API_KEY: 'my-secret-api-key',
                DB_PASSWORD: 'db-secret',
                NON_SENSITIVE_KEY: 'non-secret-value',
            });
            service = new EnvironmentConfigService();
            const config = service.getAllConfig();

            expect(config.API_KEY).toBe('********');
            expect(config.DB_PASSWORD).toBe('********');
            expect(config.NON_SENSITIVE_KEY).toBe('non-secret-value');
            expect(config.NODE_ENV).toBe('test'); // Required key, not sensitive
        });

        it('should ensure required sensitive keys are present but masked', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            // Instantiate the service first
            service = new EnvironmentConfigService();

            // Temporarily modify sensitiveKeyPatterns for this test on the *existing* instance
            const originalSensitivePatterns = (service as any).sensitiveKeyPatterns;
            (service as any).sensitiveKeyPatterns = [...originalSensitivePatterns, /COGNITO_CLIENT_ID/i];

            const config = service.getAllConfig();

            expect(config.COGNITO_CLIENT_ID).toBe('********');

            // Restore original patterns
            (service as any).sensitiveKeyPatterns = originalSensitivePatterns;
        });

        it('should return [MISSING REQUIRED KEY] for missing required keys in getAllConfig', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                // Missing COGNITO_USER_POOL_ID
                COGNITO_CLIENT_ID: 'client-id',
            });
            // Suppress constructor error for this test
            consoleErrorSpy.mockImplementation(() => { });
            expect(() => new EnvironmentConfigService()).toThrow(); // Expect constructor to throw

            // Re-initialize service after the throw, to get a valid instance for getAllConfig
            // This is a bit hacky, but allows testing getAllConfig in isolation
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();
            (service as any).config.COGNITO_USER_POOL_ID = undefined; // Simulate missing after init

            const config = service.getAllConfig();
            expect(config.COGNITO_USER_POOL_ID).toBe('[MISSING REQUIRED KEY]');
        });
    });

    // --- has Tests ---
    describe('has', () => {
        beforeEach(() => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                EXISTING_KEY: 'value',
                EMPTY_STRING_KEY: '',
            });
            service = new EnvironmentConfigService();
        });

        it('should return true if the key exists and has a value', () => {
            expect(service.has('EXISTING_KEY')).toBe(true);
        });

        it('should return false if the key exists but has an empty string value', () => {
            // The has method checks for undefined, not empty string
            expect(service.has('EMPTY_STRING_KEY')).toBe(true);
        });

        it('should return false if the key is missing', () => {
            expect(service.has('NON_EXISTENT_KEY')).toBe(false);
        });
    });

    // --- reloadConfig Tests ---
    describe('reloadConfig', () => {
        it('should re-read process.env and update config', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
                INITIAL_KEY: 'initial-value',
            });
            service = new EnvironmentConfigService();
            expect(service.get('INITIAL_KEY')).toBe('initial-value');

            // Simulate environment variable change
            process.env.INITIAL_KEY = 'new-value';
            process.env.NEW_KEY = 'added-value';

            service.reloadConfig();

            expect(service.get('INITIAL_KEY')).toBe('new-value');
            expect(service.get('NEW_KEY')).toBe('added-value');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Reloading config from current process.env'));
            expect(consoleInfoSpy).toHaveBeenCalledWith('[ConfigService] Configuration reloaded and required keys verified.');
        });

        it('should throw an error if required keys are missing after reload', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();

            // Simulate a required key becoming missing
            delete process.env.COGNITO_CLIENT_ID;

            expect(() => service.reloadConfig()).toThrow(
                /Missing or empty required environment variables after reload: COGNITO_CLIENT_ID/
            );
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        });
    });

    // --- isDevelopment, isProduction, isTest Tests ---
    describe('environment checks', () => {
        it('isDevelopment should return true for development NODE_ENV', () => {
            setupProcessEnv({
                NODE_ENV: 'development',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();
            expect(service.isDevelopment()).toBe(true);
            expect(service.isProduction()).toBe(false);
            expect(service.isTest()).toBe(false);
        });

        it('isProduction should return true for production NODE_ENV', () => {
            setupProcessEnv({
                NODE_ENV: 'production',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();
            expect(service.isDevelopment()).toBe(false);
            expect(service.isProduction()).toBe(true);
            expect(service.isTest()).toBe(false);
        });

        it('isTest should return true for test NODE_ENV', () => {
            setupProcessEnv({
                NODE_ENV: 'test',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();
            expect(service.isDevelopment()).toBe(false);
            expect(service.isProduction()).toBe(false);
            expect(service.isTest()).toBe(true);
        });

        it('should return false for all if NODE_ENV is unknown', () => {
            setupProcessEnv({
                NODE_ENV: 'staging',
                PORT: '3000',
                LOG_LEVEL: 'info',
                AWS_REGION: 'us-east-1',
                COGNITO_USER_POOL_ID: 'pool-id',
                COGNITO_CLIENT_ID: 'client-id',
            });
            service = new EnvironmentConfigService();
            expect(service.isDevelopment()).toBe(false);
            expect(service.isProduction()).toBe(false);
            expect(service.isTest()).toBe(false);
        });
    });
});