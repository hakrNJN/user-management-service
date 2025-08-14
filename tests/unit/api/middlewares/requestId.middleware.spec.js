"use strict";
// tests/unit/api/middlewares/requestId.middleware.spec.ts
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const requestId_middleware_1 = require("../../../../src/api/middlewares/requestId.middleware");
// Mock the uuid library
jest.mock('uuid', () => ({
    v4: jest.fn(),
}));
describe('RequestId Middleware', () => {
    let mockRequest;
    let mockResponse;
    let mockNext;
    let mockSetHeader;
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
        (0, requestId_middleware_1.addRequestId)(mockRequest, mockResponse, mockNext);
        expect(uuid_1.v4).toHaveBeenCalledTimes(1);
    });
    it('should attach the generated ID to req.id', () => {
        const testUuid = 'test-uuid-1234';
        uuid_1.v4.mockReturnValue(testUuid); // Control the returned UUID
        (0, requestId_middleware_1.addRequestId)(mockRequest, mockResponse, mockNext);
        // Type assertion is okay here as we expect the middleware to add it
        expect(mockRequest.id).toBe(testUuid);
    });
    it('should set the X-Request-ID header on the response', () => {
        const testUuid = 'test-uuid-5678';
        uuid_1.v4.mockReturnValue(testUuid);
        (0, requestId_middleware_1.addRequestId)(mockRequest, mockResponse, mockNext);
        expect(mockSetHeader).toHaveBeenCalledTimes(1);
        expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', testUuid);
    });
    it('should call next() exactly once', () => {
        (0, requestId_middleware_1.addRequestId)(mockRequest, mockResponse, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(); // Ensure it's called without an error
    });
});
