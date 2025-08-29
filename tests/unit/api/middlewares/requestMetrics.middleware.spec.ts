import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { requestMetricsMiddleware } from '../../../../src/api/middlewares/requestMetrics.middleware';
import { httpRequestCounter, httpRequestDurationMicroseconds } from '../../../../src/infrastructure/monitoring/metrics';

// Mock the metrics module
jest.mock('../../../../src/infrastructure/monitoring/metrics', () => ({
    httpRequestCounter: {
        inc: jest.fn(),
    },
    httpRequestDurationMicroseconds: {
        startTimer: jest.fn(),
    },
}));

describe('requestMetricsMiddleware', () => {
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: jest.Mock;
    let endTimerMock: jest.Mock;

    // Store event listeners
    const resListeners: { [key: string]: Function[] } = {};

    beforeEach(() => {
        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();
        endTimerMock = jest.fn();

        // Mock Request and Response properties
        req.method = 'GET';
        req.originalUrl = '/test';
        res.statusCode = 200;

        // Mock res.on to capture event listeners
        res.on.mockImplementation((event: string, listener: Function) => {
            if (!resListeners[event]) {
                resListeners[event] = [];
            }
            resListeners[event].push(listener);
            return res; // Allow chaining
        });

        // Mock startTimer to return our mock endTimer function
        (httpRequestDurationMicroseconds.startTimer as jest.Mock).mockReturnValue(endTimerMock);

        // Clear mocks
        (httpRequestCounter.inc as jest.Mock).mockClear();
        (httpRequestDurationMicroseconds.startTimer as jest.Mock).mockClear();
        endTimerMock.mockClear();
    });

    afterEach(() => {
        // Clear captured listeners
        for (const key in resListeners) {
            delete resListeners[key];
        }
    });

    // Helper to trigger a response event
    const triggerResEvent = (event: string) => {
        resListeners[event]?.forEach(listener => listener());
    };

    it('should call startTimer and attach finish listener', () => {
        requestMetricsMiddleware(req, res, next);

        expect(httpRequestDurationMicroseconds.startTimer).toHaveBeenCalledTimes(1);
        expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('should increment counter and observe duration on response finish with known route', () => {
        req.route = { path: '/users' };
        requestMetricsMiddleware(req, res, next);

        triggerResEvent('finish');

        expect(httpRequestCounter.inc).toHaveBeenCalledTimes(1);
        expect(httpRequestCounter.inc).toHaveBeenCalledWith({
            method: 'GET',
            route: '/users',
            status_code: 200,
        });

        expect(endTimerMock).toHaveBeenCalledTimes(1);
        expect(endTimerMock).toHaveBeenCalledWith({
            method: 'GET',
            route: '/users',
            code: 200,
        });
    });

    it('should increment counter and observe duration on response finish with unknown route', () => {
        req.route = undefined; // Simulate unknown route
        requestMetricsMiddleware(req, res, next);

        triggerResEvent('finish');

        expect(httpRequestCounter.inc).toHaveBeenCalledTimes(1);
        expect(httpRequestCounter.inc).toHaveBeenCalledWith({
            method: 'GET',
            route: 'unknown_route',
            status_code: 200,
        });

        expect(endTimerMock).toHaveBeenCalledTimes(1);
        expect(endTimerMock).toHaveBeenCalledWith({
            method: 'GET',
            route: 'unknown_route',
            code: 200,
        });
    });

    it('should handle different status codes', () => {
        req.route = { path: '/data' };
        res.statusCode = 404;
        requestMetricsMiddleware(req, res, next);

        triggerResEvent('finish');

        expect(httpRequestCounter.inc).toHaveBeenCalledWith(expect.objectContaining({
            status_code: 404,
        }));
        expect(endTimerMock).toHaveBeenCalledWith(expect.objectContaining({
            code: 404,
        }));
    });
});