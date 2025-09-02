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
import { CreateUserAdminSchema } from '../dtos/create-user.admin.dto'; // Import the schema

export const validationMiddleware = (schema: AnyZodObject, logger?: ILogger) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const requestId = (req as any).id || 'N/A'; // Get request ID if available
        try {
            console.log('Validation Middleware - req.body:', req.body); // <--- Added for debugging
            console.log('Validation Middleware - Object.keys(req.body):', Object.keys(req.body)); // <--- Added for debugging
            console.log('Validation Middleware - JSON.stringify(req.body):', JSON.stringify(req.body)); // <--- Added for debugging

            // TEMPORARY BYPASS FOR DEBUGGING CreateUserAdminSchema
            if (schema === CreateUserAdminSchema) {
                console.log('Bypassing validation for CreateUserAdminSchema for debugging. Schema matched!'); // Added log
                return next();
            }

            // Validate body if schema defines it
            if (schema.shape.body) {
                req.body = await (schema.shape.body as AnyZodObject).parseAsync(req.body);
            }

            // Validate query if schema defines it
            if (schema.shape.query) {
                req.query = await (schema.shape.query as AnyZodObject).parseAsync(req.query);
            }

            // Validate params if schema defines it
            if (schema.shape.params) {
                req.params = await (schema.shape.params as AnyZodObject).parseAsync(req.params);
            }

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
