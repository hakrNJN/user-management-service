import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet'; // Security headers
import { addRequestId, createErrorMiddleware, createRequestLoggerMiddleware } from './api/middlewares'; // Import middlewares
import routes from './api/routes'; // Main application routes
import { HttpStatusCode } from './application/enums/HttpStatusCode'; // Use status codes
import { IConfigService } from './application/interfaces/IConfigService';
import { ILogger } from './application/interfaces/ILogger';
import { container } from './container';
import { TYPES } from './shared/constants/types';
import { RequestContextUtil } from './shared/utils/requestContext'; // Import context utility

export function createApp(): Express { // No need for async if setup is synchronous
  const configService = container.resolve<IConfigService>(TYPES.ConfigService);
  const logger = container.resolve<ILogger>(TYPES.Logger);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  const app: Express = express();

  // --- Core Middleware ---

  // 1. Security Headers (Helmet) - Apply early
  app.use(helmet());

  // 2. CORS Configuration
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  if (corsOrigin === '*' && nodeEnv !== 'development') {
    logger.warn('CORS_ORIGIN is set to "*" in a non-development environment. This is insecure!');
  }
  app.use(cors({ origin: corsOrigin, exposedHeaders: ['X-Request-ID'] })); // Expose X-Request-ID if needed by frontend
  logger.info(`CORS configured for origin: ${corsOrigin}`);

  // 3. Body Parsers
  app.use(express.json({ limit: '1mb' })); // Add reasonable limits
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Request Tracking & Context Middleware ---
  // IMPORTANT: Order matters here!
  // addRequestId must run first to generate the ID.
  // RequestContextUtil establishes the async context, potentially using req.id.
  // createRequestLoggerMiddleware uses the established context.

  app.use(addRequestId); // 4. Adds req.id and X-Request-ID header
  // Note: Authentication middleware would typically go HERE if you want userId in context/logs globally
  app.use(RequestContextUtil.middleware); // 5. Sets up AsyncLocalStorage context (uses req.id)
  app.use(createRequestLoggerMiddleware(logger)); // 6. Logs requests/responses (uses context)


  // --- API Routes ---
  // All routes defined in './api/routes' will have access to req.id and context
  app.use('/api', routes); // 7. Your main application routes


  // --- Catch-all for 404 Not Found ---
  // This runs if no API route matched the request
  app.use((req: Request, res: Response, next: NextFunction) => { // 8. Handles requests not matched by routes
    const requestId = RequestContextUtil.getRequestId(); // Get ID for response
    logger.warn(`Route not found: ${req.method} ${req.url}`, { requestId });
    res.status(HttpStatusCode.NOT_FOUND).json({
        status: 'error',
        name: 'NotFoundError',
        message: `The requested resource ${req.method} ${req.url} was not found.`,
        requestId: requestId,
    });
  });
//   app.use((req: Request, res: Response, next: NextFunction) => {
//     // Create a NotFoundError instance and pass it to the error handler
//     // This ensures consistent error formatting
//     const err = new Error(`Not Found - ${req.method} ${req.url}`);
//     (err as any).statusCode = 404; // Add status code for error handler
//     next(err); // Pass to global error handler
// });

  // --- Global Error Handling Middleware ---
  // This MUST be the LAST middleware added with app.use()
  // It catches errors passed via next(error) from routes or earlier middleware
  app.use(createErrorMiddleware(logger, configService)); // 9. Handles errors passed via next(err)

  logger.info(`Application setup complete for environment: ${nodeEnv}`);

  return app;
}