// tests/unit/api/middlewares/error.middleware.spec.ts

import { NextFunction, Request, Response } from 'express';
import { createErrorMiddleware } from '../../../../src/api/middlewares/error.middleware';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { NotFoundError, ValidationError } from '../../../../src/shared/errors/BaseError';
import { RequestContextUtil } from '../../../../src/shared/utils/requestContext';
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

// Mock RequestContextUtil
jest.mock('../../../../src/shared/utils/requestContext', () => ({
    RequestContextUtil: {
        getRequestId: jest.fn(),
        getCorrelationId: jest.fn(),
        getUserId: jest.fn(),
    },
}));

describe('Error Handling Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let logger: jest.Mocked<ILogger>;
    let configService: jest.Mocked<IConfigService>;
    let middleware: (err: Error, req: Request, res: Response, next: NextFunction) => void;

    let mockStatus: jest.Mock;
    let mockJson: jest.Mock;

    const mockReqId = 'err-req-123';
    const mockCorrId = 'err-corr-456';
    const mockUserId = 'err-user-789';

    beforeEach(() => {
        jest.clearAllMocks();
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;

        // Setup mocks for RequestContextUtil
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(mockReqId);
        (RequestContextUtil.getCorrelationId as jest.Mock).mockReturnValue(mockCorrId);
        (RequestContextUtil.getUserId as jest.Mock).mockReturnValue(mockUserId);

        mockRequest = {
            originalUrl: '/error/path',
            method: 'POST',
            id: mockReqId, // Fallback req id
        };
        mockJson = jest.fn();
        mockStatus = jest.fn(() => ({ json: mockJson })); // Chain status().json()
        mockResponse = {
            headersSent: false, // Assume headers not sent initially
            status: mockStatus,
            // json: mockJson, // json is called via status()
        };
        mockNext = jest.fn();

        // Create middleware instance
        middleware = createErrorMiddleware(logger, configService);
    });

    it('should handle BaseError (operational) correctly', () => {
        const validationError = new ValidationError('Input invalid', { field: 'bad value' }); // isOperational = true, statusCode = 400

        middleware(validationError, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.warn).toHaveBeenCalledTimes(1); // Operational client errors are logged as warnings
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(`Client error processing request: ${validationError.message}`),
            expect.objectContaining({
                requestId: mockReqId,
                correlationId: mockCorrId,
                userId: mockUserId,
                errorName: 'ValidationError',
                errorMessage: validationError.message,
                statusCode: 400,
                path: '/error/path',
                method: 'POST',
                isOperational: true,
                details: { field: 'bad value' }, // Check details are logged
                stack: expect.any(String), // Stack logged even for operational in non-prod
            })
        );
        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'ValidationError',
            message: validationError.message,
            requestId: mockReqId,
            details: { field: 'bad value' }, // Check details are included in response
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

     it('should handle generic Error (non-operational) correctly in development', () => {
        const genericError = new Error('Something unexpected broke!');
        configService.isProduction.mockReturnValue(false); // Simulate development

        middleware(genericError, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.error).toHaveBeenCalledTimes(1); // Non-operational errors are logged as errors
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Server error processing request: ${genericError.message}`),
            expect.objectContaining({
                requestId: mockReqId,
                errorName: 'Error',
                statusCode: 500,
                isOperational: false, // Default for generic Error
                stack: genericError.stack, // Stack logged in dev
            })
        );
        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'Error', // Show actual error name in dev
            message: genericError.message, // Show actual message in dev
            requestId: mockReqId,
            stack: genericError.stack, // Show stack in dev response
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle generic Error (non-operational) correctly in production', () => {
        const genericError = new Error('Something unexpected broke!');

        // FIX: Explicitly set isProduction to true for THIS test case
        configService.isProduction.mockReturnValue(true);

        // Invoke the middleware AFTER setting the mock value
        middleware(genericError, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.error).toHaveBeenCalledTimes(1);
        // Now the assertion should match because the stack should be undefined
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Server error processing request: ${genericError.message}`),
            expect.objectContaining({
                statusCode: 500,
                isOperational: false,
                stack: undefined, // Should now be undefined as isProduction() is true
            })
        );
        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'InternalServerError', // Generic name in prod
            message: 'An unexpected internal server error occurred.', // Generic message in prod
            requestId: mockReqId,
            // No stack in prod response
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

     it('should delegate to default handler if headers already sent', () => {
        const error = new Error('Error after headers sent');
        (mockResponse as Response).headersSent = true; // Simulate headers sent

        middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.warn).toHaveBeenCalledWith(
            'Headers already sent, cannot send error response. Delegating.',
            { requestId: mockReqId }
        );
        expect(mockStatus).not.toHaveBeenCalled();
        expect(mockJson).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(error); // Pass error to default handler
    });

    it('should handle BaseError without details', () => {
        const notFoundError = new NotFoundError('Resource'); // No details provided

        middleware(notFoundError, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.warn).toHaveBeenCalledWith(
             expect.anything(), // Message
             expect.objectContaining({ details: undefined }) // Ensure details is undefined in log
        );
         expect(mockStatus).toHaveBeenCalledWith(404);
         expect(mockJson).toHaveBeenCalledWith(
             expect.objectContaining({ name: 'NotFoundError', message: 'Resource not found.' })
         );
         expect(mockJson).not.toHaveBeenCalledWith(
             expect.objectContaining({ details: expect.anything() }) // No details in response
         );
    });

    it('should use fallback request ID if context util returns undefined', () => {
         (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(undefined); // Simulate context not ready
         const error = new Error('Test Error');

         middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

         expect(logger.error).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requestId: mockReqId })); // Used req.id
         expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ requestId: mockReqId }));
    });
});