// tests/unit/api/middlewares/requestLogger.middleware.spec.ts

import { NextFunction, Request, Response } from 'express';
import { createRequestLoggerMiddleware } from '../../../../src/api/middlewares/requestLogger.middleware';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { RequestContextUtil } from '../../../../src/shared/utils/requestContext';
import { mockLogger } from '../../../mocks/logger.mock';

// Mock RequestContextUtil
jest.mock('../../../../src/shared/utils/requestContext', () => ({
    RequestContextUtil: {
        getRequestId: jest.fn(),
        getCorrelationId: jest.fn(),
        getUserId: jest.fn(),
    },
}));

describe('Request Logger Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let logger: jest.Mocked<ILogger>;
    let middleware: (req: Request, res: Response, next: NextFunction) => void;
    let mockResOn: jest.Mock;
    let eventCallbacks: { [key: string]: Function }; // To store 'finish'/'close' callbacks

    const mockReqId = 'req-123';
    const mockCorrId = 'corr-456';
    const mockUserId = 'user-789';

    beforeEach(() => {
        jest.clearAllMocks();
        eventCallbacks = {};
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        // Setup mocks for RequestContextUtil
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue(mockReqId);
        (RequestContextUtil.getCorrelationId as jest.Mock).mockReturnValue(mockCorrId);
        (RequestContextUtil.getUserId as jest.Mock).mockReturnValue(mockUserId);

        mockRequest = {
            ip: '127.0.0.1',
            method: 'GET',
            originalUrl: '/test/path?query=1',
            httpVersion: '1.1',
            headers: {
                'user-agent': 'jest-test-agent',
            },
            socket: { remoteAddress: 'socket-addr' } as any,
        };

        // Mock response methods and event emitter 'on'
        mockResOn = jest.fn((event, callback) => {
             eventCallbacks[event] = callback; // Store callback by event name
             return mockResponse as Response; // Return 'this' for chaining if needed
        });

        mockResponse = {
            statusCode: 200, // Default success code
            writableFinished: false,
            getHeader: jest.fn((name: string) => {
                 if (name === 'content-length') return '1024';
                 return undefined;
            }),
            on: mockResOn,
        };

        mockNext = jest.fn();

        // Mock process.hrtime for duration calculation
        const mockStartTime = [1000, 500000000] as [number, number]; // Example start time
        const mockEndTime = [1001, 700000000] as [number, number]; // Example end time
        jest.spyOn(process, 'hrtime')
            .mockReturnValueOnce(mockStartTime) // Initial call gets start time
            .mockReturnValue([ // Subsequent calls calculate diff based on end time
                 mockEndTime[0] - mockStartTime[0],
                 mockEndTime[1] - mockStartTime[1],
            ]);


        // Create middleware instance
        middleware = createRequestLoggerMiddleware(logger);
    });

    it('should log request arrival with context details', () => {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            '--> GET /test/path?query=1',
            expect.objectContaining({
                requestId: mockReqId,
                correlationId: mockCorrId,
                userId: mockUserId,
                ip: '127.0.0.1',
                method: 'GET',
                url: '/test/path?query=1',
                httpVersion: '1.1',
                userAgent: 'jest-test-agent',
            })
        );
    });

    it('should call next() exactly once', () => {
         middleware(mockRequest as Request, mockResponse as Response, mockNext);
         expect(mockNext).toHaveBeenCalledTimes(1);
         expect(mockNext).toHaveBeenCalledWith();
    });

    it('should register "finish" and "close" listeners on response', () => {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
        expect(mockResOn).toHaveBeenCalledWith('finish', expect.any(Function));
        expect(mockResOn).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should log response details on "finish" event with info level for 2xx', () => {
        mockResponse.statusCode = 200;
        middleware(mockRequest as Request, mockResponse as Response, mockNext);

        // Simulate 'finish' event
        eventCallbacks['finish']();

        // Arrival log + Finish log
        expect(logger.info).toHaveBeenCalledTimes(2);
        expect(logger.info).toHaveBeenLastCalledWith(
            expect.stringMatching(/<-- GET \/test\/path\?query=1 200 \d+(\.\d+)?ms/), // Check message format
            expect.objectContaining({
                requestId: mockReqId,
                correlationId: mockCorrId,
                userId: mockUserId,
                statusCode: 200,
                durationMs: expect.any(Number), // Check duration calculation
                contentLength: '1024',
                eventType: 'finish',
            })
        );
        // Check duration calculation (based on mocked hrtime) -> (1 * 1e3 + 200000000 * 1e-6) = 1000 + 200 = 1200ms
        const finishLogMeta = (logger.info as jest.Mock).mock.calls[1][1];
        expect(finishLogMeta.durationMs).toBeCloseTo(1200);
    });

    it('should log response details on "finish" event with warn level for 4xx', () => {
        mockResponse.statusCode = 404;
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
        eventCallbacks['finish']();
        expect(logger.info).toHaveBeenCalledTimes(1); // Only arrival
        expect(logger.warn).toHaveBeenCalledTimes(1); // Finish log as warning
        expect(logger.warn).toHaveBeenCalledWith(
             expect.stringMatching(/<-- GET \/test\/path\?query=1 404 \d+(\.\d+)?ms/),
             expect.objectContaining({ statusCode: 404, eventType: 'finish' })
        );
    });

     it('should log response details on "finish" event with error level for 5xx', () => {
        mockResponse.statusCode = 500;
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
        eventCallbacks['finish']();
        expect(logger.info).toHaveBeenCalledTimes(1); // Only arrival
        expect(logger.error).toHaveBeenCalledTimes(1); // Finish log as error
        expect(logger.error).toHaveBeenCalledWith(
             expect.stringMatching(/<-- GET \/test\/path\?query=1 500 \d+(\.\d+)?ms/),
             expect.objectContaining({ statusCode: 500, eventType: 'finish' })
        );
    });

    it('should log response details on "close" event if response did not finish', () => {
        mockResponse.statusCode = 503;
        // mockResponse.writableFinished = false; // Simulate closed before finish
        middleware(mockRequest as Request, mockResponse as Response, mockNext);

        // Simulate 'close' event
        eventCallbacks['close']();

        expect(logger.info).toHaveBeenCalledTimes(1); // Arrival
        // Log level depends on status code even for close
        expect(logger.error).toHaveBeenCalledTimes(1); // Close log as error (because 503)
        expect(logger.error).toHaveBeenCalledWith(
             expect.stringMatching(/<-- GET \/test\/path\?query=1 CLOSED \d+(\.\d+)?ms/), // Status text is CLOSED
             expect.objectContaining({
                 statusCode: 503,
                 eventType: 'close', // Event type is close
             })
        );
    });

    it('should NOT log response details on "close" event if response already finished', () => {
        mockResponse.statusCode = 200;
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
    
        // Simulate 'finish' then 'close'
        eventCallbacks['finish']();
        // Note: We don't need to set mockResponse.writableFinished = true
        // because the middleware now tracks this internally
        eventCallbacks['close']();
    
        expect(logger.info).toHaveBeenCalledTimes(2); // Arrival + Finish
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled(); // Close log should be skipped
    });
});
