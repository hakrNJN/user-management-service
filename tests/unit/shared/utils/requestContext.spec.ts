import { RequestContextUtil } from '@src/shared/utils/requestContext';

describe('RequestContextUtil', () => {
    describe('outside middleware context', () => {
        it('getContext() returns undefined outside a request', () => {
            expect(RequestContextUtil.getContext()).toBeUndefined();
        });

        it('getRequestId() returns fallback string outside a request', () => {
            expect(RequestContextUtil.getRequestId()).toBe('no-request-context');
        });

        it('getCorrelationId() returns fallback string outside a request', () => {
            expect(RequestContextUtil.getCorrelationId()).toBe('no-request-context');
        });

        it('getUserId() returns undefined outside a request', () => {
            expect(RequestContextUtil.getUserId()).toBeUndefined();
        });

        it('getRequestDuration() returns 0 outside a request', () => {
            expect(RequestContextUtil.getRequestDuration()).toBe(0);
        });
    });

    describe('middleware()', () => {
        it('should call next() and establish context with requestId', (done) => {
            const mockReq: any = {
                id: 'req-123',
                headers: {},
                user: { id: 'user-abc' },
            };
            const mockRes: any = {};
            const next = () => {
                // Inside context now
                expect(RequestContextUtil.getRequestId()).toBe('req-123');
                expect(RequestContextUtil.getCorrelationId()).toBe('req-123');
                expect(RequestContextUtil.getUserId()).toBe('user-abc');
                expect(RequestContextUtil.getRequestDuration()).toBeGreaterThanOrEqual(0);
                expect(RequestContextUtil.getContext()).toBeDefined();
                done();
            };
            RequestContextUtil.middleware(mockReq, mockRes, next);
        });

        it('should use correlation header when provided', (done) => {
            const mockReq: any = {
                headers: { 'x-correlation-id': 'corr-456', 'x-request-id': 'req-789' },
            };
            const mockRes: any = {};
            const next = () => {
                expect(RequestContextUtil.getCorrelationId()).toBe('corr-456');
                done();
            };
            RequestContextUtil.middleware(mockReq, mockRes, next);
        });
    });
});
