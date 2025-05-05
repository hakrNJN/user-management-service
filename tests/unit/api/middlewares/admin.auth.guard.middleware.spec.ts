import 'reflect-metadata'; // MUST be first

import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, VerifyErrors } from 'jsonwebtoken';
import { SigningKey } from 'jwks-rsa';

import { createAdminAuthGuardMiddleware } from '../../../../src/api/middlewares/admin.auth.guard.middleware';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AuthenticationError, InvalidTokenError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

// --- Mock Libraries ---
const mockGetSigningKey = jest.fn();
const mockJwksClientInstance = { getSigningKey: mockGetSigningKey };
jest.mock('jwks-rsa', () => jest.fn(() => mockJwksClientInstance));
jest.mock('jsonwebtoken');
const mockJwtVerify = jwt.verify as jest.Mock;
// --- End Mocks ---

// Define the structure expected in the JWT payload from Cognito
interface CognitoJwtPayload extends JwtPayload {
    'cognito:username'?: string;
    'cognito:groups'?: string[];
}

describe('Admin Auth Guard Middleware Unit Tests', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    let configService: jest.Mocked<IConfigService>; // Use mocked service
    let logger: jest.Mocked<ILogger>; // Use mocked logger

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

    const validDecodedPayload: CognitoJwtPayload = {
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
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        // Configure mocks for THIS middleware's needs
        configService.getOrThrow.mockImplementation((key: string): string => {
            // Retrieve actual test values
            if (key === 'COGNITO_JWKS_URI') return envJwksUri;
            if (key === 'COGNITO_ISSUER') return envIssuer;
            if (key === 'COGNITO_CLIENT_ID') return envAudience; // Can be mocked to undefined to test audience skip
            throw new Error(`getOrThrow mock missing for key: ${key}`);
        });
        configService.getBoolean.mockImplementation((key: string, defaultValue?: boolean): boolean => {
            if (key === TEST_AUTH_BYPASS_FLAG) return process.env[TEST_AUTH_BYPASS_FLAG] === 'true'; // Reflect env var
            return defaultValue ?? false;
        });
        configService.get.mockImplementation((key: string, defaultValue?: any): any => {
            if (key === 'NODE_ENV') return process.env.NODE_ENV || defaultValue || 'test';
            return defaultValue;
        });

        mockRequest = { headers: {}, id: 'auth-req-123' };
        mockResponse = {};
        mockNext = jest.fn();

        // Create middleware instance using the factory, passing mocked services
        middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService);

        // Default setup for successful JWT verification path
        mockGetSigningKey.mockImplementation((kid, callback) => {
            if (kid === testKid) {
                const mockKey: Partial<SigningKey> = { getPublicKey: jest.fn().mockReturnValue(testPublicKey) };
                callback(null, mockKey as SigningKey);
            } else {
                callback(new Error('Invalid KID'), undefined);
            }
        });
        mockJwtVerify.mockImplementation((token, getKeyFunc, options, callback) => {
            // Simulate calling the getKey function provided by the middleware
            // This part is tricky to mock perfectly but we can simulate success/failure
            if (token === testToken) {
                callback(null, validDecodedPayload); // Simulate successful verification
            } else {
                callback(new Error('Invalid token in mock verify') as VerifyErrors, undefined);
            }
        });
    });

    // --- Bypass Token Tests ---
    describe('Test Token Bypass', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'test'; // Ensure test env
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true'; // Enable bypass via flag
            middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService); // Recreate middleware with updated env var state
        });

        it('should bypass JWT validation and set adminUser if bypass flag is true and token matches', async () => {
            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };

            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(); // No error
            expect(mockJwtVerify).not.toHaveBeenCalled(); // JWT verify skipped
            expect(mockRequest.adminUser).toBeDefined();
            expect(mockRequest.adminUser?.username).toBe('testadmin@bypass.local');
            expect(mockRequest.adminUser?.roles).toContain(testRequiredRole);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK: Using TEST TOKEN BYPASS'));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin authentication successful for user: testadmin@bypass.local'));
        });

        it('should fall through to JWT validation if bypass flag is true but token mismatches', async () => {
            mockRequest.headers = { authorization: `Bearer wrong-bypass-token` };
            // Make JWT validation fail to see if next(error) is called
            const jwtError = new InvalidTokenError('Test JWT failure after bypass mismatch');
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(jwtError, undefined));


            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Test environment bypass enabled, but token MISMATCH'));
            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should be attempted
            expect(mockNext).toHaveBeenCalledWith(jwtError); // Should fail with the JWT error
            expect(mockRequest.adminUser).toBeUndefined(); // No admin user set
        });

        it('should fall through to JWT validation if bypass flag is false', async () => {
            process.env[TEST_AUTH_BYPASS_FLAG] = 'false'; // Disable bypass
            middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService); // Recreate middleware

            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` }; // Correct bypass token, but flag is off
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(null, validDecodedPayload)); // Simulate JWT success


            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should run
            expect(mockNext).toHaveBeenCalledWith(); // Should succeed via JWT path
            expect(mockRequest.adminUser).toBeDefined(); // Admin user set via JWT path
            expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK')); // Bypass log NOT called
        });

        it('should fall through to JWT validation if NODE_ENV is production (even if flag is true)', async () => {
            process.env.NODE_ENV = 'production'; // Simulate production
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true'; // Flag is accidentally true
            middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService); // Recreate middleware

            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };
            mockJwtVerify.mockImplementation((token, getKey, options, callback) => callback(null, validDecodedPayload)); // Simulate JWT success


            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockJwtVerify).toHaveBeenCalled(); // JWT validation should run
            expect(mockNext).toHaveBeenCalledWith(); // Should succeed via JWT path
            expect(mockRequest.adminUser).toBeDefined();
            expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('SECURITY RISK'));
            expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('CRITICAL SECURITY ALERT')); // Should not block
        });

        it('should BLOCK request and log critical error if bypass flag is true in production (paranoid check in middleware)', async () => {
            process.env.NODE_ENV = 'production';
            process.env[TEST_AUTH_BYPASS_FLAG] = 'true';
            // Override the config mock directly for this specific scenario if needed
            configService.getBoolean.mockImplementation((key: string, defaultValue?: boolean): boolean => {
                if (key === TEST_AUTH_BYPASS_FLAG) return true;
                return defaultValue ?? false;
            });
            configService.get.mockImplementation((key: string, defaultValue?: any): any => {
                if (key === 'NODE_ENV') return 'production';
                return defaultValue;
            });
            middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService); // Recreate middleware

            mockRequest.headers = { authorization: `Bearer ${testBypassToken}` };


            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL SECURITY ALERT'));
            expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError)); // Should call next with error
            expect((mockNext as jest.Mock).mock.calls[0][0].message).toContain('Server configuration error prevents authentication bypass.');
            expect((mockNext as jest.Mock).mock.calls[0][0].statusCode).toBe(500);
            expect(mockJwtVerify).not.toHaveBeenCalled();
        });

    });

    // --- Standard JWT Validation Tests ---
    describe('Standard JWT Validation', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'development'; // Not production
            process.env[TEST_AUTH_BYPASS_FLAG] = 'false'; // Bypass disabled
            middleware = createAdminAuthGuardMiddleware(testRequiredRole, logger, configService); // Recreate middleware
        });

        it('should call next() and set req.adminUser on successful verification', async () => {
            mockRequest.headers = { authorization: `Bearer ${testToken}` };
            // Mocks for getKey and jwt.verify already set up in top-level beforeEach

            await middleware(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockJwtVerify).toHaveBeenCalledWith(
                testToken, expect.any(Function),
                expect.objectContaining({ audience: envAudience, issuer: envIssuer }),
                expect.any(Function)
            );
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(); // No error argument
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin authentication successful'));
            expect(mockRequest.adminUser).toBeDefined();
            expect(mockRequest.adminUser?.id).toBe(validDecodedPayload.sub);
            expect(mockRequest.adminUser?.roles).toContain(testRequiredRole);
        });

        it('should call next() with AuthenticationError if Authorization header is missing', async () => {
            mockRequest.headers = {}; // No authorization header
            await middleware(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
            expect((mockNext as jest.Mock).mock.calls[0][0].message).toContain('missing or invalid');
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid Authorization header'));
        });

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