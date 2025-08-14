"use strict";
// tests/unit/api/middlewares/validation.middleware.spec.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const validation_middleware_1 = require("../../../../src/api/middlewares/validation.middleware");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const logger_mock_1 = require("../../../mocks/logger.mock"); // Assuming logger mock exists
// Mock Zod schema and error
const mockParseAsync = jest.fn();
const mockSchema = {
    parseAsync: mockParseAsync,
}; // Cast as AnyZodObject for the test
const mockZodError = new zod_1.ZodError([
    { code: 'invalid_type', expected: 'string', received: 'number', path: ['body', 'name'], message: 'Expected string' },
]);
describe('Validation Middleware', () => {
    let mockRequest;
    let mockResponse;
    let mockNext;
    let logger;
    let middleware;
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
        logger = Object.assign({}, logger_mock_1.mockLogger); // Use logger mock
        // Create middleware instance for tests
        middleware = (0, validation_middleware_1.validationMiddleware)(mockSchema, logger);
    });
    it('should call next() without arguments if validation succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
        const validatedData = { body: { name: 'valid' }, query: { page: 1 }, params: { id: 'abc' } };
        mockParseAsync.mockResolvedValue(validatedData); // Simulate successful parsing
        yield middleware(mockRequest, mockResponse, mockNext);
        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(); // No error argument
    }));
    it('should call next() with ValidationError if Zod validation fails', () => __awaiter(void 0, void 0, void 0, function* () {
        mockParseAsync.mockRejectedValue(mockZodError); // Simulate Zod error
        yield middleware(mockRequest, mockResponse, mockNext);
        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError_1.ValidationError)); // Check for ValidationError instance
        const errorArg = mockNext.mock.calls[0][0];
        expect(errorArg.message).toBe('Input validation failed');
        expect(errorArg.statusCode).toBe(400);
        expect(errorArg.details).toEqual({ 'body.name': 'Expected string' }); // Check formatted errors
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Request validation failed [test-req-id]'), { errors: { 'body.name': 'Expected string' } });
    }));
    it('should call next() with the original error for non-Zod errors', () => __awaiter(void 0, void 0, void 0, function* () {
        const unexpectedError = new Error('Something else went wrong');
        mockParseAsync.mockRejectedValue(unexpectedError); // Simulate generic error
        yield middleware(mockRequest, mockResponse, mockNext);
        expect(mockParseAsync).toHaveBeenCalledWith({
            body: mockRequest.body,
            query: mockRequest.query,
            params: mockRequest.params,
        });
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(unexpectedError); // Pass original error
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected error during validation middleware [test-req-id]'), unexpectedError);
    }));
    it('should work without a logger provided', () => __awaiter(void 0, void 0, void 0, function* () {
        middleware = (0, validation_middleware_1.validationMiddleware)(mockSchema); // No logger
        mockParseAsync.mockRejectedValue(mockZodError);
        yield middleware(mockRequest, mockResponse, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError_1.ValidationError));
        expect(logger.warn).not.toHaveBeenCalled(); // Logger methods should not be called
        expect(logger.error).not.toHaveBeenCalled();
    }));
});
