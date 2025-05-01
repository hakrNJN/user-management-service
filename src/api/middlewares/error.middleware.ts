// src/api/middlewares/error.middleware.ts

import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { IConfigService } from '../../application/interfaces/IConfigService';
import { ILogger } from '../../application/interfaces/ILogger';
import { BaseError } from '../../shared/errors/BaseError';
import { RequestContextUtil } from '../../shared/utils/requestContext';

export const createErrorMiddleware = (
    logger: ILogger,
    configService: IConfigService
): ErrorRequestHandler => {
    return (err: Error | BaseError, req: Request, res: Response, next: NextFunction): void => {
        const requestId = RequestContextUtil.getRequestId() || req.id || 'N/A';
        const correlationId = RequestContextUtil.getCorrelationId();
        const userId = RequestContextUtil.getUserId();

        let statusCode: number = HttpStatusCode.INTERNAL_SERVER_ERROR;
        let isOperationalError = false;
        let errorDetails: any = undefined;

        if (err instanceof BaseError) {
            statusCode = err.statusCode;
            isOperationalError = err.isOperational;
            if (err.details) {
                 errorDetails = err.details;
            }
        }

        // Determine log level based ONLY on the error type/status
        const logLevel = (statusCode >= 500 || !isOperationalError) ? 'error' : 'warn';
        const logMessagePrefix = (logLevel === 'error') ? 'Server error' : 'Client error';
        // Determine if development separately
        const isDevelopment = !configService.isProduction(); // Check once

        logger[logLevel](`${logMessagePrefix} processing request: ${err.message}`, {
            requestId,
            correlationId,
            userId: userId || 'anonymous',
            errorName: err.name,
            errorMessage: err.message,
            statusCode: statusCode,
            path: req.originalUrl,
            method: req.method,
            isOperational: isOperationalError,
            details: errorDetails,
            // --- FIX: Only include stack if in development ---
            stack: isDevelopment ? err.stack : undefined,
        });

        if (res.headersSent) {
            logger.warn('Headers already sent, cannot send error response. Delegating.', { requestId });
            return next(err);
        }

        let responseBody: Record<string, any> = {
            status: 'error',
            name: 'InternalServerError',
            message: 'An unexpected internal server error occurred.',
            requestId: requestId,
        };

        if (isOperationalError) {
            responseBody.name = err.name;
            responseBody.message = err.message;
            if (errorDetails) {
                responseBody.details = errorDetails;
            }
        } else {
            // Unknown/programmer errors - details only in development
            if (isDevelopment) { // Check the variable
                responseBody.name = err.name || 'InternalServerError';
                responseBody.message = err.message;
                responseBody.stack = err.stack; // Stack in response body only for dev
            }
            // Production response for non-operational errors remains generic
        }

        res.status(statusCode).json(responseBody);
    };
};