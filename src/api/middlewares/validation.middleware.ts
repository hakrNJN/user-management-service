import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ILogger } from '../../application/interfaces/ILogger';
import { ValidationError } from '../../shared/errors/BaseError';

/**
 * Factory function that creates an Express middleware for validating request data
 * (body, query params, route params) against a provided Zod schema.
 * (Similar to the Authentication Service)
 *
 * @param schema - The Zod schema (AnyZodObject) to validate against.
 * @param logger - Optional logger instance for logging validation errors.
 * @returns An Express middleware function.
 */
export const validationMiddleware = (schema: AnyZodObject, logger?: ILogger) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const requestId = (req as any).id || 'N/A'; // Get request ID if available
        try {
            // Validate the entire request object
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });

            // Optional: Attach validated data to request if needed downstream,
            // though accessing req.body/query/params directly is usually sufficient.
            // req.validatedData = parsed;

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.reduce((acc, currentError) => {
                    const path = currentError.path.join('.');
                    acc[path] = currentError.message;
                    return acc;
                }, {} as Record<string, string>);

                logger?.warn(`Request validation failed [${requestId}]:`, { errors: formattedErrors });

                const validationError = new ValidationError(
                    'Input validation failed',
                    formattedErrors
                );
                next(validationError); // Pass custom error to global handler
            } else {
                logger?.error(`Unexpected error during validation middleware [${requestId}]:`, error);
                next(error); // Pass unexpected errors
            }
        }
    };
