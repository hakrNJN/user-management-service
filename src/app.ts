import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet'; // Security headers
import { addRequestId, createErrorMiddleware, createRequestLoggerMiddleware, jwtAuthMiddleware } from './api/middlewares'; // Import middlewares
import routes from './api/routes'; // Main application routes
import { HttpStatusCode } from './application/enums/HttpStatusCode'; // Use status codes
import { IConfigService } from './application/interfaces/IConfigService';
import { ILogger } from './application/interfaces/ILogger';
import { container } from './container';
import { TYPES } from './shared/constants/types';
import { RequestContextUtil } from './shared/utils/requestContext'; // Import context utility

import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

import { requestMetricsMiddleware } from './api/middlewares/requestMetrics.middleware';

export function createApp(): Express {
  // Initialize OpenTelemetry tracing here
  const serviceName = 'user-management-service';
  const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317';

  const traceExporter = new OTLPTraceExporter({
    url: collectorEndpoint,
  });

  const spanProcessor = new BatchSpanProcessor(traceExporter);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    spanProcessor: spanProcessor,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

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

  // Apply metrics middleware
  app.use(requestMetricsMiddleware);

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
  app.use(jwtAuthMiddleware()); // 7. JWT Authentication Middleware


  // --- API Routes ---
  // All routes defined in './api/routes' will have access to req.id and context
  app.use('/api', routes); // 8. Your main application routes

  // In app.ts, the 404 handler currently sends a direct JSON response.
  // Consider creating a NotFoundError instance and passing it to next(err)
  // (like the commented-out code). This ensures all errors (including 404s)
  // go through the centralized error.middleware.ts for consistent formatting and logging.
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