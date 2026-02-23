import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { createAdminAuthGuardMiddleware } from '../../../../src/api/middlewares/admin.auth.guard.middleware';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AuthenticationError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { AuthenticatedUser } from '../../../../src/shared/types/authenticated-user.interface';

// Custom Request mock type to allow setting adminUser
interface CustomRequest extends Request {
    adminUser?: AdminUser;
}

describe('AdminAuthGuardMiddleware', () => {
    let req: MockProxy<CustomRequest>; // Use CustomRequest
    let res: MockProxy<Response>;
    let next: jest.Mock;
    let loggerMock: MockProxy<ILogger>;
    let configServiceMock: MockProxy<IConfigService>;

    const requiredRole = 'admin';
    const decodedPayloadWithRole: AuthenticatedUser = {
        id: 'user-id-123',
        username: 'testuser',
        attributes: { 'cognito:username': 'testuser', 'cognito:groups': [requiredRole], sub: 'user-id-123', 'custom:tenantId': 'test-tenant' },
        roles: [requiredRole],
    };
    const decodedPayloadWithoutRole: AuthenticatedUser = {
        id: 'user-id-456',
        username: 'testuser2',
        attributes: { 'cognito:username': 'testuser2', 'cognito:groups': ['viewer'], sub: 'user-id-456' },
        roles: ['viewer'],
    };

    beforeEach(() => {
        req = mock<CustomRequest>();
        // Add a getter/setter for adminUser on the mock
        let _adminUser: AdminUser | undefined;
        Object.defineProperty(req, 'adminUser', {
            get: jest.fn(() => _adminUser),
            set: jest.fn((value: AdminUser) => { _adminUser = value; }),
            configurable: true, // Allow re-defining if needed
        });
        res = mock<Response>();
        next = jest.fn();
        loggerMock = mock<ILogger>();
        configServiceMock = mock<IConfigService>();

        // Default mock for configService.get
        configServiceMock.get.mockReturnValue('some-value');

        // Mock request ID
        req.id = 'test-request-id';
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Restore original container.resolve
    });

    // Test Case 1: Successful Authentication and Authorization
    it('should call next() and populate req.adminUser if user has the required role', async () => {
        req.user = decodedPayloadWithRole;
        const middleware = createAdminAuthGuardMiddleware(requiredRole, loggerMock, configServiceMock);

        await middleware(req, res, next);

        expect(req.adminUser).toBeDefined();
        expect(req.adminUser?.id).toBe(decodedPayloadWithRole.id);
        expect(req.adminUser?.tenantId).toBe('test-tenant');
        expect(req.adminUser?.username).toBe(decodedPayloadWithRole.username);
        expect(req.adminUser?.roles).toEqual([requiredRole]);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(); // next() called without arguments
        const expectedLogMessage = `[AdminGuard - test-request-id] Admin authentication successful for user: ${decodedPayloadWithRole.username} (ID: ${decodedPayloadWithRole.id})`;
        expect(loggerMock.info).toHaveBeenLastCalledWith(
            expectedLogMessage,
            expect.objectContaining({
                userId: decodedPayloadWithRole.id,
                username: decodedPayloadWithRole.username,
                roles: decodedPayloadWithRole.roles
            })
        );
    });

    // Test Case 2: Authentication Failure (req.user not populated)
    it('should throw AuthenticationError and call next(error) if req.user is not populated', async () => {
        req.user = undefined; // Simulate req.user not being set by previous middleware
        const middleware = createAdminAuthGuardMiddleware(requiredRole, loggerMock, configServiceMock);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
        expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('req.user not populated'), expect.any(AuthenticationError));
    });

    // Test Case 3: Authorization Failure (missing required role)
    it('should throw ForbiddenError and call next(error) if user lacks the required role', async () => {
        req.user = decodedPayloadWithoutRole;
        const middleware = createAdminAuthGuardMiddleware(requiredRole, loggerMock, configServiceMock);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(BaseError));
        expect(next.mock.calls[0][0].name).toBe('ForbiddenError');
        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('User lacks required role'), expect.any(Object));
    });

    // Test Case 4: General Error Handling
    it('should catch and pass unexpected errors to next(error)', async () => {
        // Simulate an error within the middleware logic (e.g., logger.info throwing)
        const unexpectedError = new BaseError('UnexpectedError', 500, 'Unexpected logger error', true);
        loggerMock.info.mockImplementation(() => { throw unexpectedError; });
        req.user = decodedPayloadWithRole;
        const middleware = createAdminAuthGuardMiddleware(requiredRole, loggerMock, configServiceMock);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(unexpectedError);
        const expectedErrorMessage = `[AdminGuard - test-request-id] Error during admin authorization: ${unexpectedError.message}`;
        expect(loggerMock.error).toHaveBeenCalledWith(expectedErrorMessage, unexpectedError);
    });
});