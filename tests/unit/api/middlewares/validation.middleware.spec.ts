import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { validationMiddleware } from '../../../../src/api/middlewares/validation.middleware';
import { AnyZodObject, z, ZodError } from 'zod';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { ValidationError } from '../../../../src/shared/errors/BaseError';

describe('validationMiddleware', () => {
    let loggerMock: MockProxy<ILogger>;
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: jest.Mock;

    // Define a sample Zod schema for testing
    const testSchema = z.object({
        body: z.object({
            name: z.string().min(1, 'Name is required'),
            age: z.number().min(18, 'Must be 18 or older'),
        }),
        query: z.object({
            page: z.string().optional(),
        }),
        params: z.object({
            id: z.string().uuid('Invalid ID format'),
        }),
    });

    beforeEach(() => {
        loggerMock = mock<ILogger>();
        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();

        // Mock req.id
        Object.defineProperty(req, 'id', { value: 'test-req-id' });
    });

    // Test Case 1: Successful Validation
    it('should call next() if validation is successful', async () => {
        req.body = { name: 'John Doe', age: 30 };
        req.query = { page: '1' };
        req.params = { id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' };

        const middleware = validationMiddleware(testSchema, loggerMock);
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(); // Called without arguments
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });

    // Test Case 2: Validation Failure (ZodError) - Body
    it('should call next(ValidationError) and log warning if body validation fails', async () => {
        req.body = { name: '', age: 17 }; // Invalid data
        req.query = {};
        req.params = { id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' };

        const middleware = validationMiddleware(testSchema, loggerMock);
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
        const validationError = next.mock.calls[0][0] as ValidationError;
        expect(validationError.message).toBe('Input validation failed');
        expect(validationError.details).toEqual({
            'name': 'Name is required',
            'age': 'Must be 18 or older',
        });
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
            expect.stringContaining('Request validation failed'),
            expect.objectContaining({
                errors: expect.objectContaining({
                    'name': 'Name is required',
                    'age': 'Must be 18 or older',
                }),
            })
        );
        expect(loggerMock.error).not.toHaveBeenCalled();
    });

    // Test Case 3: Validation Failure (ZodError) - Params
    it('should call next(ValidationError) and log warning if params validation fails', async () => {
        req.body = { name: 'Jane Doe', age: 25 };
        req.query = {};
        req.params = { id: 'invalid-uuid' }; // Invalid ID

        const middleware = validationMiddleware(testSchema, loggerMock);
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
        const validationError = next.mock.calls[0][0] as ValidationError;
        expect(validationError.details).toEqual({
            'id': 'Invalid ID format',
        });
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
            expect.stringContaining('Request validation failed'),
            expect.objectContaining({
                errors: expect.objectContaining({
                    'id': 'Invalid ID format',
                }),
            })
        );
    });

    // Test Case 4: Unexpected Error during validation
    it('should call next(error) and log error for unexpected errors', async () => {
        // Simulate an unexpected error by providing a schema that throws
        const throwingSchema = z.object({
            body: z.object({
                name: z.string().transform(() => { throw new Error('Transform error'); })
            })
        });

        req.body = { name: 'test' };
        req.query = {};
        req.params = {};

        const middleware = validationMiddleware(throwingSchema, loggerMock);
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe('Transform error');
        expect(loggerMock.error).toHaveBeenCalledTimes(1);
        expect(loggerMock.error).toHaveBeenCalledWith(
            expect.stringContaining('Unexpected error during validation middleware'),
            expect.any(Error)
        );
        expect(loggerMock.warn).not.toHaveBeenCalled();
    });
});