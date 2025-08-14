import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Add a default label which is added to all metrics
registry.setDefaultLabels({
  serviceName: 'user-management-service',
});

// Enable the collection of default metrics
collectDefaultMetrics({ register: registry });

// Define a custom counter for HTTP requests
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// Define a custom histogram for HTTP request durations
export const httpRequestDurationMicroseconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  // buckets for response time from 0.1ms to 500ms
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  registers: [registry],
});