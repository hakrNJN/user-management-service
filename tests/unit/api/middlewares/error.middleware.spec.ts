import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { createErrorMiddleware } from '../../../../src/api/middlewares/error.middleware';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { NotFoundError, ValidationError } from '../../../../src/shared/errors/BaseError';
import { RequestContextUtil } from '../../../../src/shared/utils/requestContext';

jest.mock('../../../../src/shared/utils/requestContext');

describe('ErrorMiddleware', () => {
    let loggerMock: MockProxy<ILogger>;
    let configServiceMock: MockProxy<IConfigService>;
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: jest.Mock;

    beforeEach(() => {
        loggerMock = mock<ILogger>();
        configServiceMock = mock<IConfigService>();
        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();

        // Mock res.status and res.json to allow chaining
        res.status.mockReturnThis();
        res.json.mockReturnThis();
        res.headersSent = false; // Explicitly set headersSent to false

        // Reset RequestContextUtil mocks
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue('test-request-id');
        (RequestContextUtil.getCorrelationId as jest.Mock).mockReturnValue('test-correlation-id');
        (RequestContextUtil.getUserId as jest.Mock).mockReturnValue('test-user-id');
    });

    // Test Case 1: Operational Error (e.g., NotFoundError) in Development
    it('should handle operational errors in development environment', () => {
        configServiceMock.isProduction.mockReturnValue(false); // Development
        const error = new NotFoundError('Resource');
        const middleware = createErrorMiddleware(loggerMock, configServiceMock);

        middleware(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NOT_FOUND);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            name: 'NotFoundError',
            message: 'Resource not found.',
            requestId: 'test-request-id',
        });
        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Client error'), expect.any(Object));
        expect(loggerMock.warn.mock.calls[0][1]?.stack).toBeDefined(); // Stack should be present in dev
        expect(next).not.toHaveBeenCalled();
    });

    // Test Case 2: Operational Error in Production
    it('should handle operational errors in production environment', () => {
        configServiceMock.isProduction.mockReturnValue(true); // Production
        const error = new ValidationError('Invalid input', { field: 'name' });
        const middleware = createErrorMiddleware(loggerMock, configServiceMock);

        middleware(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(HttpStatusCode.BAD_REQUEST);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            name: 'ValidationError',
            message: 'Invalid input',
            requestId: 'test-request-id',
            details: { field: 'name' },
        });
        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Client error'), expect.any(Object));
        expect(loggerMock.warn.mock.calls[0][1]?.stack).toBeUndefined(); // Stack should be undefined in prod
        expect(next).not.toHaveBeenCalled();
    });

    // Test Case 3: Non-Operational Error (Generic Error) in Development
    it('should handle non-operational errors in development environment', () => {
        configServiceMock.isProduction.mockReturnValue(false); // Development
        const error = new Error('Something unexpected happened');
        const middleware = createErrorMiddleware(loggerMock, configServiceMock);

        middleware(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(HttpStatusCode.INTERNAL_SERVER_ERROR);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'error',
            name: 'Error',
            message: 'Something unexpected happened',
            requestId: 'test-request-id',
            stack: expect.any(String), // Stack should be present
        }));
        expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Server error'), expect.any(Object));
        expect(next).not.toHaveBeenCalled();
    });

    // Test Case 4: Non-Operational Error in Production
    it('should handle non-operational errors in production environment', () => {
        configServiceMock.isProduction.mockReturnValue(true); // Production
        const error = new Error('Something unexpected happened');
        const middleware = createErrorMiddleware(loggerMock, configServiceMock);

        middleware(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(HttpStatusCode.INTERNAL_SERVER_ERROR);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            name: 'InternalServerError',
            message: 'An unexpected internal server error occurred.',
            requestId: 'test-request-id',
        });
        expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Server error'), expect.any(Object));
        expect(next).not.toHaveBeenCalled();
    });

    // Test Case 5: Headers Already Sent
    it('should call next(err) if headers have already been sent', () => {
        res.headersSent = true; // Simulate headers already sent
        const error = new Error('Test error after headers sent');
        const middleware = createErrorMiddleware(loggerMock, configServiceMock);

        middleware(error, req, res, next);

        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Headers already sent'), expect.any(Object));
        expect(next).toHaveBeenCalledWith(error);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});