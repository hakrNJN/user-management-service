/**
 * Base class for custom operational errors within the application.
 * (Can be copied from previous services)
 */
export class BaseError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly details?: any;

    constructor(name: string, statusCode: number, message: string, isOperational = true, details?: any) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;

        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// --- Example Specific Shared Errors ---

export class ValidationError extends BaseError {
    constructor(message = 'Validation Failed', details?: Record<string, any>) {
        super('ValidationError', 400, message, true, details);
    }
}

export class NotFoundError extends BaseError {
    constructor(resource = 'Resource',details?: Record<string, any>) {
        super('NotFoundError', 404, `${resource} not found.`, true, details);
    }
}

// Define other shared errors if needed (e.g., DatabaseError)
