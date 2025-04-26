import { NextFunction, Request, Response } from 'express';
import { ILogger } from '../../application/interfaces/ILogger';
import { RequestContextUtil } from '../../shared/utils/requestContext'; // Import context utility

/**
 * Factory function to create request logging middleware.
 * Logs request arrival and response finish/close events.
 * Relies on addRequestId and RequestContextUtil middleware running before it.
 *
 * @param logger - An instance of the logger service.
 * @returns An Express middleware function.
 */
export const createRequestLoggerMiddleware = (logger: ILogger): ((req: Request, res: Response, next: NextFunction) => void) => {

    return (req: Request, res: Response, next: NextFunction): void => {
        // Start time captured accurately within this middleware's scope
        const start = process.hrtime();
        // Get context info - relies on previous middleware
        const requestId = RequestContextUtil.getRequestId(); // Get ID from established context
        const correlationId = RequestContextUtil.getCorrelationId(); // Get correlation ID from context
        const userId = RequestContextUtil.getUserId(); // Get user ID from context

        // Log request arrival
        const requestMeta = {
            requestId,
            correlationId,
            userId: userId || 'anonymous', // Indicate if user is anonymous
            ip: req.ip || req.socket?.remoteAddress,
            method: req.method,
            url: req.originalUrl,
            httpVersion: req.httpVersion,
            userAgent: req.headers['user-agent'],
            // Add other relevant request details if needed (e.g., query params, headers)
        };
        logger.info(`--> ${req.method} ${req.originalUrl}`, requestMeta);

        const logResponse = (eventType: 'finish' | 'close') => {
             // Avoid logging 'close' if 'finish' already happened
            if (eventType === 'close' && res.writableFinished) {
                return;
            }

            const diff = process.hrtime(start);
            const duration = (diff[0] * 1e3 + diff[1] * 1e-6); // Duration in ms (keep as number)
            const statusCode = res.statusCode;
            const statusMessage = eventType === 'close' ? 'CLOSED' : statusCode;

            const logLevel = statusCode >= 500 ? 'error' : (statusCode >= 400 ? 'warn' : 'info');

            const responseMeta = {
                requestId,
                correlationId,
                userId: userId || 'anonymous',
                statusCode,
                durationMs: parseFloat(duration.toFixed(3)), // Format for logging if desired
                contentLength: res.getHeader('content-length'),
                eventType: eventType, // 'finish' or 'close'
            };

            logger.info( `<-- ${req.method} ${req.originalUrl} ${statusMessage} ${duration.toFixed(3)}ms`, responseMeta);
        };

        // Log response finish (successful completion)
        res.on('finish', () => logResponse('finish'));

        // Log response close (e.g., connection aborted before finish)
        res.on('close', () => logResponse('close'));

        next();
    };
};