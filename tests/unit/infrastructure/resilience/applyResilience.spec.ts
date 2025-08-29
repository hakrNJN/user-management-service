import { mock, MockProxy } from 'jest-mock-extended';
import CircuitBreaker from 'opossum';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { applyCircuitBreaker } from '../../../../src/infrastructure/resilience/applyResilience';
import { CircuitBreakerOptions } from '../../../../src/infrastructure/resilience/circuit-breaker.config';

// Create a mock breaker instance that we can reuse
const mockBreakerInstance = {
    fire: jest.fn(),
    on: jest.fn(),
};

// Mock opossum module
jest.mock('opossum', () => {
    return jest.fn(() => mockBreakerInstance);
});

describe('applyCircuitBreaker', () => {
    let mockAsyncFunction: jest.Mock;
    let loggerMock: MockProxy<ILogger>;
    let MockedCircuitBreaker: jest.MockedClass<typeof CircuitBreaker>;

    beforeEach(() => {
        mockAsyncFunction = jest.fn();
        // Set the function name property explicitly
        Object.defineProperty(mockAsyncFunction, 'name', {
            value: 'mockAsyncFunction',
            configurable: true
        });

        loggerMock = mock<ILogger>();
        MockedCircuitBreaker = CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>;

        // Clear mocks
        jest.clearAllMocks();
        MockedCircuitBreaker.mockClear();
        mockBreakerInstance.fire.mockClear();
        mockBreakerInstance.on.mockClear();
    });

    // Test Case 1: Initialization
    it('should instantiate CircuitBreaker with the async function and default options', () => {
        applyCircuitBreaker(mockAsyncFunction);

        expect(MockedCircuitBreaker).toHaveBeenCalledTimes(1);
        expect(MockedCircuitBreaker).toHaveBeenCalledWith(mockAsyncFunction, CircuitBreakerOptions.default);
    });

    it('should instantiate CircuitBreaker with the async function and specified options', () => {
        const optionsKey = 'cognito';
        applyCircuitBreaker(mockAsyncFunction, optionsKey);

        expect(MockedCircuitBreaker).toHaveBeenCalledTimes(1);
        expect(MockedCircuitBreaker).toHaveBeenCalledWith(mockAsyncFunction, CircuitBreakerOptions.cognito);
    });

    // Test Case 2: Function Execution
    it('should call breaker.fire with the correct arguments when the wrapped function is executed', async () => {
        mockAsyncFunction.mockResolvedValue('success');
        mockBreakerInstance.fire.mockResolvedValue('success');

        const wrappedFunction = applyCircuitBreaker(mockAsyncFunction);
        const result = await wrappedFunction('arg1', 123);

        expect(mockBreakerInstance.fire).toHaveBeenCalledTimes(1);
        expect(mockBreakerInstance.fire).toHaveBeenCalledWith('arg1', 123);
        expect(result).toBe('success');
    });

    it('should propagate rejection from breaker.fire', async () => {
        const testError = new Error('Breaker failed');
        mockBreakerInstance.fire.mockRejectedValue(testError);

        const wrappedFunction = applyCircuitBreaker(mockAsyncFunction);
        await expect(wrappedFunction()).rejects.toThrow(testError);
    });

    // Test Case 3: Logger Integration
    it('should register logger for circuit breaker events', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        expect(mockBreakerInstance.on).toHaveBeenCalledWith('open', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('fallback', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('failure', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('success', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('timeout', expect.any(Function));
        expect(mockBreakerInstance.on).toHaveBeenCalledWith('reject', expect.any(Function));
    });

    it('should call logger.warn when circuit breaker opens', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        // Find the 'open' event listener
        const openCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'open');
        expect(openCall).toBeDefined();

        const openListener = openCall![1];
        openListener();

        expect(loggerMock.warn).toHaveBeenCalledWith('CircuitBreaker (mockAsyncFunction) opened. Service failing.');
    });

    it('should call logger.error when circuit breaker detects failure', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        // Find the 'failure' event listener
        const failureCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'failure');
        expect(failureCall).toBeDefined();

        const failureListener = failureCall![1];
        const failureError = new Error('Test failure');
        failureListener(failureError);

        expect(loggerMock.error).toHaveBeenCalledWith(
            'CircuitBreaker (mockAsyncFunction) failure detected.',
            failureError
        );
    });

    it('should call logger.info when circuit breaker closes', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        // Find the 'close' event listener
        const closeCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'close');
        expect(closeCall).toBeDefined();

        const closeListener = closeCall![1];
        closeListener();

        expect(loggerMock.info).toHaveBeenCalledWith('CircuitBreaker (mockAsyncFunction) closed. Service restored.');
    });

    it('should call logger.debug when circuit breaker succeeds', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        // Find the 'success' event listener
        const successCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'success');
        expect(successCall).toBeDefined();

        const successListener = successCall![1];
        successListener('test result', 100); // result and latencyMs parameters

        expect(loggerMock.debug).toHaveBeenCalledWith('CircuitBreaker (mockAsyncFunction) success.');
    });

    it('should not register logger events when no logger is provided', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default');

        expect(mockBreakerInstance.on).not.toHaveBeenCalled();
    });

    it('should handle fallback event correctly', () => {
        applyCircuitBreaker(mockAsyncFunction, 'default', loggerMock);

        // Find the 'fallback' event listener
        const fallbackCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'fallback');
        expect(fallbackCall).toBeDefined();

        const fallbackListener = fallbackCall![1];
        const testError = new Error('Test error');
        fallbackListener('fallback result', testError);

        expect(loggerMock.warn).toHaveBeenCalledWith(
            'CircuitBreaker (mockAsyncFunction) fallback executed.',
            { result: 'fallback result', error: testError.message }
        );
    });

    it('should handle unnamed functions gracefully', () => {
        const unnamedFunction = jest.fn();
        // Don't set a name property, let it default to empty or undefined
        Object.defineProperty(unnamedFunction, 'name', {
            value: '',
            configurable: true
        });

        applyCircuitBreaker(unnamedFunction, 'default', loggerMock);

        // Find the 'open' event listener
        const openCall = mockBreakerInstance.on.mock.calls.find(call => call[0] === 'open');
        expect(openCall).toBeDefined();

        const openListener = openCall![1];
        openListener();

        expect(loggerMock.warn).toHaveBeenCalledWith('CircuitBreaker (UnnamedService) opened. Service failing.')
    });
});
