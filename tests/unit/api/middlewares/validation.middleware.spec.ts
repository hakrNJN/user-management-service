// tests/unit/api/middlewares/validation.middleware.spec.ts

import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { validationMiddleware } from '../../../../src/api/middlewares/validation.middleware';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { ValidationError } from '../../../../src/shared/errors/BaseError';
import { mockLogger } from '../../../mocks/logger.mock'; // Assuming logger mock exists

// Mock Zod schema and error
const mockParseAsync = jest.fn();
const mockSchema: AnyZodObject = {
    parseAsync: mockParseAsync,
} as any; // Cast as AnyZodObject for the test

const mockZodError = new ZodError([
    { code: 'invalid_type', expected: 'string', received: 'number', path: ['body', 'name'], message: 'Expected string' },
]);

describe('Validation Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let logger: jest.Mocked<ILogger>;
    let middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest = {
            body: { name: 123 }, // Example invalid data
            query: { page: '1' },
            params: { id: 'abc' },
            id: 'test-req-id', // Add request id for logging context
        };
        mockResponse = {}; // Not typically used by validation middleware
        mockNext = jest.fn();
        logger = { ...mockLogger } as jest.Mocked<ILogger>; // Use logger mock

        // Create middleware instance for tests
        middleware = validationMiddleware(mockSchema, logger);
    });

    it('should call next() without arguments if validation succeeds', async () => {
        const validatedData = { body: { name: 'valid' }, query: { page: 1 }, params: { id: 'abc' } };
        mockParseAsync.mockResolvedValue(validatedData); // Simulate successful parsing

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(); // No error argument
    });

    it('should call next() with ValidationError if Zod validation fails', async () => {
        mockParseAsync.mockRejectedValue(mockZodError); // Simulate Zod error

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError)); // Check for ValidationError instance

        const errorArg = (mockNext as jest.Mock).mock.calls[0][0] as ValidationError;
        expect(errorArg.message).toBe('Input validation failed');
        expect(errorArg.statusCode).toBe(400);
        expect(errorArg.details).toEqual({ 'body.name': 'Expected string' }); // Check formatted errors
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Request validation failed [test-req-id]'),
            { errors: { 'body.name': 'Expected string' } }
        );
    });

    it('should call next() with the original error for non-Zod errors', async () => {
        const unexpectedError = new Error('Something else went wrong');
        mockParseAsync.mockRejectedValue(unexpectedError); // Simulate generic error

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(unexpectedError); // Pass original error
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Unexpected error during validation middleware [test-req-id]'),
            unexpectedError
        );
    });

    it('should work without a logger provided', async () => {
        middleware = validationMiddleware(mockSchema); // No logger
        mockParseAsync.mockRejectedValue(mockZodError);

        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
        expect(logger.warn).not.toHaveBeenCalled(); // Logger methods should not be called
        expect(logger.error).not.toHaveBeenCalled();
    });
});