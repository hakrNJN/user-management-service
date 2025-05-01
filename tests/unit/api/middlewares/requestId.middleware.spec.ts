// tests/unit/api/middlewares/requestId.middleware.spec.ts

import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { addRequestId } from '../../../../src/api/middlewares/requestId.middleware';

// Mock the uuid library
jest.mock('uuid', () => ({
    v4: jest.fn(),
}));

describe('RequestId Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let mockSetHeader: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks before each test
        mockSetHeader = jest.fn(); // Create a fresh mock for setHeader

        // Use Partial<> for Request and Response and define necessary parts
        mockRequest = {}; // Start with empty request
        mockResponse = {
            // Mock setHeader specifically
            setHeader: mockSetHeader,
            // Add other methods/properties if needed by other middleware tests
        };
        mockNext = jest.fn(); // Mock the next function
    });

    it('should generate a unique ID using uuidv4', () => {
        addRequestId(mockRequest as Request, mockResponse as Response, mockNext);
        expect(uuidv4).toHaveBeenCalledTimes(1);
    });

    it('should attach the generated ID to req.id', () => {
        const testUuid = 'test-uuid-1234';
        (uuidv4 as jest.Mock).mockReturnValue(testUuid); // Control the returned UUID

        addRequestId(mockRequest as Request, mockResponse as Response, mockNext);

        // Type assertion is okay here as we expect the middleware to add it
        expect((mockRequest as Request).id).toBe(testUuid);
    });

    it('should set the X-Request-ID header on the response', () => {
        const testUuid = 'test-uuid-5678';
        (uuidv4 as jest.Mock).mockReturnValue(testUuid);

        addRequestId(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockSetHeader).toHaveBeenCalledTimes(1);
        expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', testUuid);
    });

    it('should call next() exactly once', () => {
        addRequestId(mockRequest as Request, mockResponse as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(); // Ensure it's called without an error
    });
});