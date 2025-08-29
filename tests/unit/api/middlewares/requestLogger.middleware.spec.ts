import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { createRequestLoggerMiddleware } from '../../../../src/api/middlewares/requestLogger.middleware';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { RequestContextUtil } from '../../../../src/shared/utils/requestContext';

jest.mock('../../../../src/shared/utils/requestContext');

describe('RequestLoggerMiddleware', () => {
    let loggerMock: MockProxy<ILogger>;
    let req: MockProxy<Request>;
    let res: MockProxy<Response> & { writableFinished: boolean };
    let next: jest.Mock;

    // Store event listeners
    const resListeners: { [key: string]: Function[] } = {};

    beforeEach(() => {
        loggerMock = mock<ILogger>();
        req = mock<Request>();
        res = mock<Response>() as MockProxy<Response> & { writableFinished: boolean };
        next = jest.fn();

        // Mock Request and Response properties
        req.method = 'GET';
        req.originalUrl = '/test';
        Object.defineProperty(req, 'ip', {
            writable: true,
            value: '127.0.0.1',
        });
        req.httpVersion = '1.1';
        req.headers = { 'user-agent': 'jest-test' };
        res.statusCode = 200;
        res.getHeader.mockReturnValue(undefined); // Default content-length

        // Mock res.on to capture event listeners
        res.on.mockImplementation((event: string, listener: Function) => {
            if (!resListeners[event]) {
                resListeners[event] = [];
            }
            resListeners[event].push(listener);
            return res; // Allow chaining
        });

        // Mock RequestContextUtil
        (RequestContextUtil.getRequestId as jest.Mock).mockReturnValue('req-id-123');
        (RequestContextUtil.getCorrelationId as jest.Mock).mockReturnValue('corr-id-456');
        (RequestContextUtil.getUserId as jest.Mock).mockReturnValue('user-id-789');

        // Mock process.hrtime for consistent duration
        let startTime: [number, number] = [0, 0];
        jest.spyOn(process, 'hrtime').mockImplementation((time?: [number, number]) => {
            if (time) {
                // Calculate diff to always show 10ms
                return [0, 10_000_000];
            }
            return startTime;
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        // Clear captured listeners
        for (const key in resListeners) {
            delete resListeners[key];
        }
    });

    // Helper to trigger a response event
    const triggerResEvent = (event: string) => {
        // Get all listeners for this event and call them sequentially
        const listeners = resListeners[event] || [];
        for (const listener of listeners) {
            listener();
        }
    };

    // Test Case 1: Request Arrival Logging
    it('should log request arrival with correct metadata', () => {
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        expect(loggerMock.info).toHaveBeenCalledTimes(1);
        expect(loggerMock.info).toHaveBeenCalledWith(
            `--> ${req.method} ${req.originalUrl}`,
            expect.objectContaining({
                requestId: 'req-id-123',
                correlationId: 'corr-id-456',
                userId: 'user-id-789',
                method: req.method,
                url: req.originalUrl,
            })
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    // Test Case 2: Response Finish Logging (2xx status)
    it('should log response finish with 2xx status as info', () => {
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        // Trigger the finish event
        triggerResEvent('finish');

        expect(loggerMock.info).toHaveBeenCalledTimes(2); // Once for request arrival, once for finish
        expect(loggerMock.info).toHaveBeenCalledWith(
            `<-- ${req.method} ${req.originalUrl} ${res.statusCode} 10.000ms`,
            expect.objectContaining({
                requestId: 'req-id-123',
                correlationId: 'corr-id-456',
                userId: 'user-id-789',
                statusCode: 200,
                durationMs: 10.000,
                eventType: 'finish',
                contentLength: undefined
            })
        );
    });

    // Test Case 3: Response Finish Logging (4xx status)
    it('should log response finish with 4xx status as warn', () => {
        res.statusCode = 404;
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        triggerResEvent('finish');

        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
            `<-- ${req.method} ${req.originalUrl} ${res.statusCode} 10.000ms`,
            expect.objectContaining({
                requestId: 'req-id-123',
                correlationId: 'corr-id-456',
                userId: 'user-id-789',
                statusCode: 404,
                durationMs: 10.000,
                eventType: 'finish',
                contentLength: undefined
            })
        );
    });

    // Test Case 4: Response Finish Logging (5xx status)
    it('should log response finish with 5xx status as error', () => {
        res.statusCode = 500;
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        triggerResEvent('finish');

        expect(loggerMock.error).toHaveBeenCalledTimes(1);
        expect(loggerMock.error).toHaveBeenCalledWith(
            `<-- ${req.method} ${req.originalUrl} ${res.statusCode} 10.000ms`,
            expect.objectContaining({
                requestId: 'req-id-123',
                correlationId: 'corr-id-456',
                userId: 'user-id-789',
                statusCode: 500,
                durationMs: 10.000,
                eventType: 'finish',
                contentLength: undefined
            })
        );
    });

    // Test Case 5: Response Close Logging (before finish)
    it('should log response close if it happens before finish', () => {
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        // Ensure writableFinished is false
        res.writableFinished = false;

        triggerResEvent('close');

        // First call for request arrival
        expect(loggerMock.info).toHaveBeenNthCalledWith(1,
            `--> ${req.method} ${req.originalUrl}`,
            expect.any(Object)
        );

        // Second call for close event
        expect(loggerMock.info).toHaveBeenNthCalledWith(2,
            `<-- ${req.method} ${req.originalUrl} CLOSED 10.000ms`,
            expect.objectContaining({
                requestId: 'req-id-123',
                correlationId: 'corr-id-456',
                userId: 'user-id-789',
                statusCode: 200,
                durationMs: 10.000,
                eventType: 'close',
                contentLength: undefined
            })
        );
    });

    // Test Case 6: Response Close Logging (after finish)
    it('should not log response close if finish already happened', () => {
        const middleware = createRequestLoggerMiddleware(loggerMock);
        middleware(req, res, next);

        triggerResEvent('finish');
        triggerResEvent('close');

        expect(loggerMock.info).toHaveBeenCalledTimes(2); // Only request arrival and finish
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });
});