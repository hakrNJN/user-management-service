import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid'; // Requires: npm install uuid @types/uuid or pnpm add uuid @types/uuid

// --- Optional: Declaration Merging (place in a .d.ts file, e.g., src/types/express.d.ts) ---
// It's highly recommended to use this approach to avoid 'any' casts.
/*
declare global {
    namespace Express {
        interface Request {
            id?: string; // Add optional id property
        }
    }
}
export {}; // Make this file a module if it's in its own .d.ts file
*/

/**
 * Express middleware to add a unique request ID (`req.id`) to each incoming request
 * and set the 'X-Request-ID' response header.
 * Should run very early in the middleware chain.
 */
export const addRequestId = (req: Request, res: Response, next: NextFunction): void => {
    // Generate unique ID
    const requestId = uuidv4();

    // Attach unique ID to the request object
    // Using 'id' property directly (relies on declaration merging in authenticated-user.interface.ts)
    req.id = requestId; // Removed unnecessary cast

    // Set header for downstream services and logs
    res.setHeader('X-Request-ID', requestId);

    next();
};
