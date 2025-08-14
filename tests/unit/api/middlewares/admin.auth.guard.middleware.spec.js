"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // MUST be first
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const admin_auth_guard_middleware_1 = require("../../../../src/api/middlewares/admin.auth.guard.middleware");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../mocks/config.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
// --- Mock Libraries ---
const mockGetSigningKey = jest.fn();
const mockJwksClientInstance = { getSigningKey: mockGetSigningKey };
jest.mock('jwks-rsa', () => jest.fn(() => mockJwksClientInstance));
jest.mock('jsonwebtoken');
const mockJwtVerify = jsonwebtoken_1.default.verify;
describe('Admin Auth Guard Middleware Unit Tests', () => {
    let mockRequest;
    let mockResponse;
    let mockNext;
    let middleware;
    let configService; // Use mocked service
    let logger; // Use mocked logger
    // Constants matching values likely set in jest.setup.ts or mocks
    const testRequiredRole = 'admin';
    const testKid = 'test-key-id-from-jwks';
    const testPublicKey = '-----BEGIN PUBLIC KEY-----\nMIIB...=\n-----END PUBLIC KEY-----'; // Example format
    const testToken = 'valid.jwt.token';
    const testBypassToken = 'valid-test-token-for-admin-bypass-12345-needs-to-be-very-unique-and-long'; // Match constant in middleware
    const TEST_AUTH_BYPASS_FLAG = 'TEST_AUTH_BYPASS_ENABLED'; // Match constant in middleware
    const envIssuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPoolId999'; // From setup/mock
    const envAudience = 'test-client-id-abc'; // From setup/mock
    const envJwksUri = `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPoolId999/.well-known/jwks.json`; // From setup/mock
    const validDecodedPayload = {
        sub: 'admin-user-sub-123', 'cognito:username': 'test-admin-user',
        'cognito:groups': [testRequiredRole, 'other-group'], iss: envIssuer,
        aud: envAudience, token_use: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
    };
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetSigningKey.mockReset();
        mockJwtVerify.mockReset();
        // Use fresh mocks from import
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // Configure mocks for THIS middleware's needs
        configService.getOrThrow.mockImplementation((key) => {
            // Retrieve actual test values
            if (key === 'COGNITO_JWKS_URI')
                return envJwksUri;
            if (key === 'COGNITO_ISSUER')
                return envIssuer;
            if (key === 'COGNITO_CLIENT_ID')
                return envAudience; // Can be mocked to undefined to test audience skip
            throw new Error(`getOrThrow mock missing for key: ${key}`);
        });
        configService.getBoolean.mockImplementation((key, defaultValue) => {
            if (key === TEST_AUTH_BYPASS_FLAG)
                return process.env[TEST_AUTH_BYPASS_FLAG] === 'true'; // Reflect env var
            return defaultValue !== null && defaultValue !== void 0 ? defaultValue : false;
        });
        configService.get.mockImplementation((key, defaultValue) => {
            if (key === 'NODE_ENV')
                return process.env.NODE_ENV || defaultValue || 'test';
            return defaultValue;
        });
        mockRequest = { headers: {}, id: 'auth-req-123' };
        mockResponse = {};
        mockNext = jest.fn();
        // Create middleware instance using the factory, passing mocked services
        middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService);
        // Default setup for successful JWT verification path
        mockGetSigningKey.mockImplementation((kid, callback) => {
            if (kid === testKid) {
                const mockKey = { getPublicKey: jest.fn().mockReturnValue(testPublicKey) };
                callback(null, mockKey);
            }
            else {
                callback(new Error('Invalid KID'), undefined);
            }
        });
        mockJwtVerify.mockImplementation((token, getKeyFunc, options, callback) => {
            // Simulate calling the getKey function provided by the middleware
            // This part is tricky to mock perfectly but we can simulate success/failure
            if (token === testToken) {
                callback(null, validDecodedPayload); // Simulate successful verification
            }
            else {
                callback(new Error('Invalid token in mock verify'), undefined);
            }
        });
    });
    // --- Bypass Token Tests ---
    describe('Test Token Bypass', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'test'; // Ensure test env
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true'; // Enable bypass via flag
            middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService); // Recreate middleware with updated env var state
        });
        it('should bypass JWT validation and set adminUser if bypass flag is true and token matches', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(); // No error
            expect(mockJwtVerify).not.toHaveBeenCalled(); // JWT verify skipped
            expect(mockRequest.adminUser).toBeDefined();
            expect((_a = mockRequest.adminUser) === null || _a === void 0 ? void 0 : _a.username).toBe('testadmin@bypass.local');
            expect((_b = mockRequest.adminUser) === null || _b === void 0 ? void 0 : _b.roles).toContain(testRequiredRole);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK: Using TEST TOKEN BYPASS'));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin authentication successful for user: testadmin@bypass.local'));
        }));
        it('should fall through to JWT validation if bypass flag is true but token mismatches', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.headers = { authorization: `Bearer wrong-bypass-token` };
            // Make JWT validation fail to see if next(error) is called
            const jwtError = new UserManagementError_1.InvalidTokenError('Test JWT failure after bypass mismatch');
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(jwtError, undefined));
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Test environment bypass enabled, but token MISMATCH'));
            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should be attempted
            expect(mockNext).toHaveBeenCalledWith(jwtError); // Should fail with the JWT error
            expect(mockRequest.adminUser).toBeUndefined(); // No admin user set
        }));
        it('should fall through to JWT validation if bypass flag is false', () => __awaiter(void 0, void 0, void 0, function* () {
            process.env[TEST_AUTH_BYPASS_FLAG] = 'false'; // Disable bypass
            middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService); // Recreate middleware
            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` }; // Correct bypass token, but flag is off
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(null, validDecodedPayload)); // Simulate JWT success
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should run
            expect(mockNext).toHaveBeenCalledWith(); // Should succeed via JWT path
            expect(mockRequest.adminUser).toBeDefined(); // Admin user set via JWT path
            expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK')); // Bypass log NOT called
        }));
        it('should fall through to JWT validation if NODE_ENV is production (even if flag is true)', () => __awaiter(void 0, void 0, void 0, function* () {
            process.env.NODE_ENV = 'production'; // Simulate production
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true'; // Flag is accidentally true
            middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService); // Recreate middleware
            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(null, validDecodedPayload)); // Simulate JWT success
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should run
            expect(mockNext).toHaveBeenCalledWith(); // Should succeed via JWT path
            expect(mockRequest.adminUser).toBeDefined();
            expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK'));
            expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('CRITICAL SECURITY ALERT')); // Should not block
        }));
        it('should BLOCK request and log critical error if bypass flag is true in production (paranoid check in middleware)', () => __awaiter(void 0, void 0, void 0, function* () {
            process.env.NODE_ENV = 'production';
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true';
            // Override the config mock directly for this specific scenario if needed
            configService.getBoolean.mockImplementation((key, defaultValue) => {
                if (key === TEST_AUTH_BYPASS_FLAG)
                    return true;
                return defaultValue !== null && defaultValue !== void 0 ? defaultValue : false;
            });
            configService.get.mockImplementation((key, defaultValue) => {
                if (key === 'NODE_ENV')
                    return 'production';
                return defaultValue;
            });
            middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService); // Recreate middleware
            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL SECURITY ALERT'));
            expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError_1.BaseError)); // Should call next with error
            expect(mockNext.mock.calls[0][0].message).toContain('Server configuration error prevents authentication bypass.');
            expect(mockNext.mock.calls[0][0].statusCode).toBe(500);
            expect(mockJwtVerify).not.toHaveBeenCalled();
        }));
    });
    // --- Standard JWT Validation Tests ---
    describe('Standard JWT Validation', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'development'; // Not production
            process.env[TEST_AUTH_BYPASS_FLAG] = 'false'; // Bypass disabled
            middleware = (0, admin_auth_guard_middleware_1.createAdminAuthGuardMiddleware)(testRequiredRole, logger, configService); // Recreate middleware
        });
        it('should call next() and set req.adminUser on successful verification', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            mockRequest.headers = { authorization: `Bearer ${testToken}` };
            // Mocks for getKey and jwt.verify already set up in top-level beforeEach
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(mockJwtVerify).toHaveBeenCalledWith(testToken, expect.any(Function), expect.objectContaining({ audience: envAudience, issuer: envIssuer }), expect.any(Function));
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(); // No error argument
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin authentication successful'));
            expect(mockRequest.adminUser).toBeDefined();
            expect((_a = mockRequest.adminUser) === null || _a === void 0 ? void 0 : _a.id).toBe(validDecodedPayload.sub);
            expect((_b = mockRequest.adminUser) === null || _b === void 0 ? void 0 : _b.roles).toContain(testRequiredRole);
        }));
        it('should call next() with AuthenticationError if Authorization header is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.headers = {}; // No authorization header
            yield middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(UserManagementError_1.AuthenticationError));
            expect(mockNext.mock.calls[0][0].message).toContain('missing or invalid');
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid Authorization header'));
        }));
        // Add tests for:
        // - Missing 'Bearer ' prefix
        // - Missing token after 'Bearer '
        // - getKey error (e.g., JWKS client error) -> InvalidTokenError
        // - jwt.verify throws TokenExpiredError
        // - jwt.verify throws other JsonWebTokenError -> InvalidTokenError
        // - User lacks required role -> ForbiddenError (BaseError with 403 status)
        // - Audience skip if COGNITO_CLIENT_ID is not provided in config
    });
});
