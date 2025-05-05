import { NextFunction, Request, Response } from 'express';
import 'reflect-metadata'; // Must be first
import { createErrorMiddleware } from '../../../../src/api/middlewares/error.middleware';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { BaseError, ValidationError } from '../../../../src/shared/errors/BaseError';
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

describe('Error Handling Middleware Unit Tests', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let logger: jest.Mocked<ILogger>;
    let configService: jest.Mocked<IConfigService>;
    let middleware: (err: Error, req: Request, res: Response, next: NextFunction) => void;

    // Mocks for response methods
    let mockStatus: jest.Mock;
    let mockJson: jest.Mock;

    // Mock context values
    const mockReqId = 'err-req-unit-123';
    const mockCorrId = 'err-corr-unit-456';
    const mockUserId = 'err-user-unit-789';

    beforeEach(() => {
        jest.clearAllMocks();

        // Use fresh mocks
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;

        // Setup mocks for RequestContextUtil
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(mockReqId);
        (RequestContextUtil.getCorrelationId as jest.Mock).mockReturnValue(mockCorrId);
        (RequestContextUtil.getUserId as jest.Mock).mockReturnValue(mockUserId);

        // Setup mock request/response
        mockRequest = {
            originalUrl: '/error/path',
            method: 'POST',
            id: mockReqId, // Include fallback req.id
        };
        mockJson = jest.fn();
        mockStatus = jest.fn(() => ({ json: mockJson })); // Chain status().json()
        mockResponse = {
            headersSent: false,
            status: mockStatus,
        };
        mockNext = jest.fn();

        // Default config mock behavior (can be overridden per test)
        configService.isProduction.mockReturnValue(false); // Default to development

        // Create middleware instance for tests
        middleware = createErrorMiddleware(logger, configService);
    });

    it('should handle operational BaseError (e.g., ValidationError) correctly', () => {
        const validationError = new ValidationError('Input invalid', { field: 'bad value' }); // isOperational = true, statusCode = 400

        middleware(validationError, mockRequest as Request, mockResponse as Response, mockNext);

        // Check Logging (Warn for client operational errors)
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(`Client error processing request: ${validationError.message}`),
            expect.objectContaining({
                requestId: mockReqId,
                correlationId: mockCorrId,
                userId: mockUserId,
                errorName: 'ValidationError',
                statusCode: 400,
                isOperational: true,
                details: { field: 'bad value' },
                stack: configService.isProduction() ? undefined : validationError.stack, // Stack included based on env
            })
        );

        // Check Response
        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'ValidationError',
            message: validationError.message,
            requestId: mockReqId,
            details: { field: 'bad value' }, // Details included in response
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle non-operational BaseError (e.g., custom DB error) correctly', () => {
        const dbError = new BaseError('DatabaseError', 503, 'DB connection failed', false); // isOperational = false

        middleware(dbError, mockRequest as Request, mockResponse as Response, mockNext);

        // Check Logging (Error for non-operational/server errors)
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Server error processing request: ${dbError.message}`),
            expect.objectContaining({
                statusCode: 503,
                isOperational: false,
                stack: configService.isProduction() ? undefined : dbError.stack,
            })
        );

        // Check Response (Generic response because !isOperational)
        expect(mockStatus).toHaveBeenCalledWith(503);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'InternalServerError', // Generic name
            message: 'An unexpected internal server error occurred.', // Generic message
            requestId: mockReqId,
            // No stack in response body by default (even in dev for non-operational BaseError?) - Check middleware logic
        });
        expect(mockNext).not.toHaveBeenCalled();
    });


    it('should handle generic Error correctly in DEVELOPMENT', () => {
        const genericError = new Error('Something unexpected broke!');
        configService.isProduction.mockReturnValue(false); // Set explicitly to dev

        middleware = createErrorMiddleware(logger, configService); // Recreate if config changes
        middleware(genericError, mockRequest as Request, mockResponse as Response, mockNext);

        // Check Logging (Error level, stack included)
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Server error processing request: ${genericError.message}`),
            expect.objectContaining({
                statusCode: 500,
                isOperational: false,
                stack: genericError.stack, // Stack logged in dev
            })
        );

        // Check Response (Detailed response in dev)
        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'Error',
            message: genericError.message,
            requestId: mockReqId,
            stack: genericError.stack, // Stack included in dev response
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle generic Error correctly in PRODUCTION', () => {
        const genericError = new Error('Something unexpected broke!');
        configService.isProduction.mockReturnValue(true); // Set explicitly to prod

        middleware = createErrorMiddleware(logger, configService); // Recreate if config changes
        middleware(genericError, mockRequest as Request, mockResponse as Response, mockNext);

        // Check Logging (Error level, stack NOT included)
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Server error processing request: ${genericError.message}`),
            expect.objectContaining({
                statusCode: 500,
                isOperational: false,
                stack: undefined, // Stack NOT logged in prod
            })
        );

        // Check Response (Generic response in prod)
        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
            status: 'error',
            name: 'InternalServerError',
            message: 'An unexpected internal server error occurred.',
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

    it('should use fallback request ID if context util returns undefined', () => {
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(undefined); // Simulate context not ready
        const error = new Error('Test Error');

        middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

        // Log should use req.id
        expect(logger.error).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requestId: mockReqId }));
        // Response should use req.id
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ requestId: mockReqId }));
    });

    it('should use "N/A" request ID if context and req.id are undefined', () => {
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(undefined);
        mockRequest.id = undefined; // Also remove req.id
        const error = new Error('Test Error');

        middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.error).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requestId: 'N/A' }));
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'N/A' }));
    });
});