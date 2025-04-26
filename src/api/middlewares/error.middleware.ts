import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode'; // Use status code enum
import { IConfigService } from '../../application/interfaces/IConfigService';
import { ILogger } from '../../application/interfaces/ILogger';
import { BaseError } from '../../shared/errors/BaseError'; // Import specific known errors
import { RequestContextUtil } from '../../shared/utils/requestContext'; // Import context utility

/**
 * Factory function to create the global error handling middleware.
 * Catches errors passed via next(err) and formats the response.
 *
 * @param logger - An instance of the logger service.
 * @param configService - An instance of the configuration service.
 * @returns An Express ErrorRequestHandler function.
 */
export const createErrorMiddleware = (
    logger: ILogger,
    configService: IConfigService
): ErrorRequestHandler => {
    // Return the actual middleware function
    return (err: Error | BaseError, req: Request, res: Response, next: NextFunction): void => {
        // Get context for logging
        const requestId = RequestContextUtil.getRequestId() || req.id || 'N/A'; // Fallback to req.id if context isn't set yet
        const correlationId = RequestContextUtil.getCorrelationId();
        const userId = RequestContextUtil.getUserId();

        // Determine log level and status code
        let statusCode: number = HttpStatusCode.INTERNAL_SERVER_ERROR; // Default to 500
        let isOperationalError = false;
        let errorDetails: any = undefined; // To store specific details like validation errors

        if (err instanceof BaseError) {
            statusCode = err.statusCode;
            isOperationalError = err.isOperational;
            // --- IMPROVEMENT: Capture details from BaseError/ValidationError ---
            // Assumes BaseError constructor accepts details and stores them
            if (err.details) {
                 errorDetails = err.details;
            }
        }

        // --- IMPROVEMENT: Adjust log level based on status code/operational flag ---
        const logLevel = (statusCode >= 500 || !isOperationalError) ? 'error' : 'warn';
        const logMessagePrefix = (logLevel === 'error') ? 'Server error' : 'Client error';

        // Log the error with full context
        logger[logLevel](`${logMessagePrefix} processing request: ${err.message}`, {
            requestId,
            correlationId,
            userId: userId || 'anonymous',
            errorName: err.name,
            errorMessage: err.message,
            statusCode: statusCode, // Log the determined status code
            path: req.originalUrl,
            method: req.method,
            isOperational: isOperationalError,
            // --- IMPROVEMENT: Log the structured details if available ---
            details: errorDetails, // Log the actual validation details object, etc.
            stack: (logLevel === 'error' || !configService.isProduction()) ? err.stack : undefined, // Log stack for errors or in dev
        });

        // If headers already sent, cannot send response, delegate to default handler
        if (res.headersSent) {
            logger.warn('Headers already sent, cannot send error response. Delegating.', { requestId });
            return next(err);
        }

        const isDevelopment = !configService.isProduction();
        let responseBody: Record<string, any> = {
            status: 'error',
            name: 'InternalServerError',
            message: 'An unexpected internal server error occurred.',
            requestId: requestId, // Add request ID to all error responses
        };

        if (isOperationalError) {
            // Handle known operational errors (Validation, NotFound, Auth, etc.)
            responseBody.name = err.name;
            responseBody.message = err.message;

            // --- IMPROVEMENT: Include specific details (like validation) in response ---
            if (errorDetails) {
                responseBody.details = errorDetails; // Use the captured details
            }
            // Add other specific error type details here if needed

        } else {
            // Unknown/programmer errors - only show details in development
            if (isDevelopment) {
                responseBody.name = err.name || 'InternalServerError';
                responseBody.message = err.message;
                responseBody.stack = err.stack; // Optionally include stack in dev response
            }
            // Keep the generic 500 message for production non-operational errors
        }


        // Send the response
        res.status(statusCode).json(responseBody);
    };
};
