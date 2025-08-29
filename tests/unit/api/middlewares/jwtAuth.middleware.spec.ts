import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { jwtAuthMiddleware } from '../../../../src/api/middlewares/jwtAuth.middleware';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AuthenticationError } from '../../../../src/domain/exceptions/UserManagementError';
import { TYPES } from '../../../../src/shared/constants/types';

// Configure test environment
beforeAll(() => {
    // Reset container
    container.clearInstances();
});

describe('jwtAuthMiddleware', () => {
    let req: MockProxy<Request> & { user?: any; accessToken?: string };
    let res: MockProxy<Response>;
    let next: jest.Mock;
    let loggerMock: MockProxy<ILogger>;
    let jwtValidatorMock: { validate: jest.Mock };

    const validToken = 'Bearer valid.jwt.token';
    const invalidToken = 'Bearer invalid.jwt.token';
    const decodedPayload = {
        sub: 'user123',
        'cognito:username': 'testuser',
        'cognito:groups': ['users'],
        email: 'test@example.com'
    };

    beforeEach(() => {
        // Reset container and mocks
        container.clearInstances();
        jest.clearAllMocks();

        // Create mocks
        req = mock<Request>() as MockProxy<Request> & { user?: any; accessToken?: string };
        req.user = undefined;
        req.accessToken = undefined;
        res = mock<Response>();
        next = jest.fn();
        loggerMock = mock<ILogger>();
        jwtValidatorMock = { validate: jest.fn() };

        // Register dependencies
        container.registerInstance(TYPES.Logger, loggerMock);
        container.registerInstance(TYPES.JwtValidator, jwtValidatorMock);
    });

    afterEach(() => {
        jest.clearAllMocks();
        container.clearInstances();
    });

    // Test Case 1: Missing Authorization Header
    it('should call next with AuthenticationError if Authorization header is missing', async () => {
        req.headers.authorization = undefined;
        const middleware = jwtAuthMiddleware();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid Authorization header'));
        expect(jwtValidatorMock.validate).not.toHaveBeenCalled();
    });

    // Test Case 2: Invalid Authorization Header Format
    it('should call next with AuthenticationError if Authorization header is invalid', async () => {
        req.headers.authorization = 'InvalidToken';
        const middleware = jwtAuthMiddleware();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid Authorization header'));
        expect(jwtValidatorMock.validate).not.toHaveBeenCalled();
    });

    // Test Case 3: Successful JWT Validation
    it('should populate req.user and req.accessToken and call next() on successful validation', async () => {
        req.headers.authorization = validToken;
        jwtValidatorMock.validate.mockResolvedValue(decodedPayload);
        const middleware = jwtAuthMiddleware();

        await middleware(req, res, next);

        expect(jwtValidatorMock.validate).toHaveBeenCalledWith(validToken.split(' ')[1]);
        expect(req.user).toEqual({
            id: 'user123',
            username: 'testuser',
            roles: ['users'],
            attributes: decodedPayload
        });
        expect(req.accessToken).toBe(validToken.split(' ')[1]);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(); // next() called without arguments
        expect(loggerMock.error).not.toHaveBeenCalled();
    });

    // Test Case 4: Failed JWT Validation
    it('should call next with AuthenticationError on failed JWT validation', async () => {
        req.headers.authorization = invalidToken;
        const validationError = new Error('Invalid JWT');
        jwtValidatorMock.validate.mockRejectedValue(validationError);
        const middleware = jwtAuthMiddleware();

        await middleware(req, res, next);

        expect(jwtValidatorMock.validate).toHaveBeenCalledWith(invalidToken.split(' ')[1]);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
        expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed for token'), validationError);
        expect(req.user).toBeUndefined();
        expect(req.accessToken).toBeUndefined();
    });
});