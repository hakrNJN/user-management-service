import { format } from 'winston';

/**
 * Defines reusable Winston log formats.
 */
export const LogFormats = {
  /**
   * Simple development format with colors, timestamp, level, message, metadata, and stack trace.
   */
  developmentFormat: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }), // Log stack traces
    format.splat(), // String interpolation
    format.colorize(), // Add colors
    format.printf(({ level, message, timestamp, stack, ...metadata }) => {
      let msg = `${timestamp} [${level}]: ${message}`;
      // Safely stringify metadata, handling potential circular references
      const metaString = Object.keys(metadata).length
        ? JSON.stringify(metadata, getCircularReplacer(), 2) // Use safe stringify
        : '';
      if (metaString && metaString !== '{}') {
        msg += `\nMetadata: ${metaString}`;
      }
      if (stack) {
        msg += `\nStack: ${stack}`;
      }
      return msg;
    })

  ),

  /**
   * Production-ready JSON format including timestamp, level, message, metadata, and stack trace.
   */
  productionFormat: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }), // Gather extra meta
    format.json() // Output as JSON
  ),
  formatRequest: (req: {
    method?: string;
    url?: string;
    headers?: Record<string, any>;
    body?: any;
  }) => ({
    request: {
      method: req.method,
      url: req.url,
      requestId: req.headers?.['x-request-id'],
      userAgent: req.headers?.['user-agent'],
      body: req.body,
    },
  }),

  formatResponse: (status: number, body: any) => ({
    response: {
      status,
      body,
    },
  }),

  formatMetrics: (metrics: {
    operation: string;
    duration: number;
    success: boolean;
  }) => ({
    metrics: {
      timestamp: new Date().toISOString(),
      ...metrics,
    },
  }),
};

/**
 * Defines reusable Winston transport configurations.
 * (Example - you might not need this if transports are simple)
 */
// export const LogTransports = {
//     console: new transports.Console({
//         level: 'info', // Default level for this transport
//     }),
//     errorFile: new transports.File({
//         filename: 'error.log',
//         level: 'error',
//     }),
// };


/**
 * Helper function to handle circular references when stringifying objects for logs.
 * @returns A replacer function for JSON.stringify.
 */
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]'; // Replace circular reference
      }
      seen.add(value);
    }
    return value; // Return value unchanged
  };
};

