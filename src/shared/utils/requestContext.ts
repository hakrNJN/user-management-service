import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express'; // Add Express types
import { AuthenticatedUser } from '../../shared/types/authenticated-user.interface'; // Adjust path as needed
import { APP_CONSTANTS } from '../constants'; // Ensure path is correct

// Define RequestContext structure
interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string; // User ID from the authenticated user
  startTime: number; // Start time for duration tracking
}

// Create the AsyncLocalStorage instance typed with RequestContext
const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextUtil = {
  /**
   * Express middleware to establish request context using AsyncLocalStorage.
   * Must run AFTER addRequestId and potentially AFTER authentication middleware
   * if userId needs to be captured immediately.
   */
  middleware: (req: Request, _res: Response, next: NextFunction): void => {
    // Extract user info if available (assuming auth guard ran before)
    const user = (req as any).user as AuthenticatedUser | undefined; // Use type assertion for clarity

    // Extract relevant headers or generate defaults
    const requestId = (req as any).id || req.headers[APP_CONSTANTS.HEADERS.REQUEST_ID] as string || 'unknown-req-id';
    const correlationId = req.headers[APP_CONSTANTS.HEADERS.CORRELATION_ID] as string || requestId; // Often defaults to requestId if not provided

    // Create the context object for this request
    const context: RequestContext = {
      requestId,
      correlationId,
      userId: user?.id,
      startTime: Date.now(),
    };

    // Run the rest of the request chain within this context
    storage.run(context, () => next());
  },

  /**
   * Gets the entire RequestContext object for the current async execution path.
   * Returns undefined if called outside the context of a request handled by the middleware.
   */
  getContext: (): RequestContext | undefined => {
    return storage.getStore();
  },

  /**
   * Gets the Request ID for the current context.
   */
  getRequestId: (): string => {
    // Provide a more specific fallback if context isn't found
    return storage.getStore()?.requestId || 'no-request-context';
  },

  /**
   * Gets the Correlation ID for the current context.
   */
  getCorrelationId: (): string => {
    return storage.getStore()?.correlationId || 'no-request-context';
  },

  /**
   * Gets the User ID for the current context, if available.
   */
  getUserId: (): string | undefined => {
    return storage.getStore()?.userId;
  },

  /**
   * Calculates the elapsed time since the request context was initiated.
   * Returns 0 if called outside the context.
   */
  getRequestDuration: (): number => {
    const startTime = storage.getStore()?.startTime;
    return startTime ? Date.now() - startTime : 0;
  },
};