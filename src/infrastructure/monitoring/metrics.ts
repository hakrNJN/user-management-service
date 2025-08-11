import { EventEmitter } from 'events';
import { inject, injectable } from 'tsyringe';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';

// TODO: Integrate with OpenTelemetry Metrics SDK for production-grade metrics collection.
// This will involve using MeterProvider, PeriodicExportingMetricReader, and Instruments (Counter, Gauge, Histogram).
// Example:
// import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
// import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
// import { Resource } from '@opentelemetry/resources';
// import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Represents a single metric data point.
 */
interface Metric {
  /** The name of the metric. */
  name: string;
  /** The value of the metric. */
  value: number;
  /** Key-value pairs providing additional context for the metric. */
  tags: Record<string, string>;
  /** The timestamp when the metric was recorded. */
  timestamp: number;
}

/**
 * Collects and reports application metrics.
 * Emits a 'metrics' event with an array of Metric objects.
 */
@injectable()
export class MetricsCollector extends EventEmitter {
  /** Stores the collected metrics, keyed by a unique string. */
  private metrics: Map<string, Metric> = new Map();

  /**
   * Initializes the MetricsCollector, sets up the logger, and starts the periodic report.
   * @param logger Logger instance for logging metric reports.
   */
  constructor(
    @inject(TYPES.Logger)
    private logger: ILogger
  ) {
    super();
    this.setupPeriodicReport();

    // TODO: Initialize OpenTelemetry MeterProvider and MetricReader here
    // const meterProvider = new MeterProvider({
    //   resource: new Resource({
    //     [SemanticResourceAttributes.SERVICE_NAME]: 'user-management-service',
    //   }),
    // });

    // const metricExporter = new OTLPMetricExporter({
    //   url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317',
    // });

    // const metricReader = new PeriodicExportingMetricReader({
    //   exporter: metricExporter,
    //   exportIntervalMillis: 60000, // Export every minute
    // });

    // meterProvider.addMetricReader(metricReader);
    // const meter = meterProvider.getMeter('default');

    // Example OpenTelemetry Counter
    // const requestCounter = meter.createCounter('http_requests_total', {
    //   description: 'Total number of HTTP requests',
    // });
    // this.on('metrics', (metrics: Metric[]) => {
    //   metrics.forEach(metric => {
    //     if (metric.name === MetricNames.HTTP_REQUEST) {
    //       requestCounter.add(metric.value, metric.tags);
    //     }
    //   });
    // });
  }

  /**
   * Increments the value of a counter metric.
   * @param name The name of the metric.
   * @param tags Optional tags to provide additional context.
   */
  increment(name: string, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    const metric = this.metrics.get(key) || {
      name,
      value: 0,
      tags,
      timestamp: Date.now(),
    };

    metric.value++;
    this.metrics.set(key, metric);
  }

  /**
   * Sets the value of a gauge metric.
   * @param name The name of the metric.
   * @param value The value of the gauge.
   * @param tags Optional tags to provide additional context.
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    this.metrics.set(key, {
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Records a timing metric.
   * @param name The name of the metric.
   * @param value The duration of the timing.
   * @param tags Optional tags to provide additional context.
   */
  timing(name: string, value: number, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    this.metrics.set(key, {
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns all currently collected metrics.
   * @returns An array of Metric objects.
   */
  getMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Generates a unique key for a metric based on its name and tags.
   * @param name The name of the metric.
   * @param tags The tags associated with the metric.
   */
  private getMetricKey(name: string, tags: Record<string, string>): string {
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}${sortedTags ? `,${sortedTags}` : ''}`;
  }

  /**
   * Sets up a periodic task to report collected metrics.
   */
  private setupPeriodicReport() {
    setInterval(() => {
      const metrics = this.getMetrics();
      if (metrics.length > 0) {
        this.logger.info('Application metrics', { metrics });
        this.emit('metrics', metrics);
      }
    }, 60000); // Report every minute
  }
}

// Create a singleton instance
// export const metricsCollector = container.resolve(MetricsCollector);

/**
 * Defines a set of standard metric names for consistent usage.
 */
// Export metric types for consistent naming
import { EventEmitter } from 'events';
import { inject, injectable } from 'tsyringe';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';

// TODO: Integrate with OpenTelemetry Metrics SDK for production-grade metrics collection.
// This will involve using MeterProvider, PeriodicExportingMetricReader, and Instruments (Counter, Gauge, Histogram).
// Example:
// import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
// import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
// import { Resource } from '@opentelemetry/resources';
// import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Represents a single metric data point.
 */
interface Metric {
  /** The name of the metric. */
  name: string;
  /** The value of the metric. */
  value: number;
  /** Key-value pairs providing additional context for the metric. */
  tags: Record<string, string>;
  /** The timestamp when the metric was recorded. */
  timestamp: number;
}

/**
 * Collects and reports application metrics.
 * Emits a 'metrics' event with an array of Metric objects.
 */
@injectable()
export class MetricsCollector extends EventEmitter {
  /** Stores the collected metrics, keyed by a unique string. */
  private metrics: Map<string, Metric> = new Map();

  /**
   * Initializes the MetricsCollector, sets up the logger, and starts the periodic report.
   * @param logger Logger instance for logging metric reports.
   */
  constructor(
    @inject(TYPES.Logger)
    private logger: ILogger
  ) {
    super();
    this.setupPeriodicReport();

    // TODO: Initialize OpenTelemetry MeterProvider and MetricReader here
    // const meterProvider = new MeterProvider({
    //   resource: new Resource({
    //     [SemanticResourceAttributes.SERVICE_NAME]: 'user-management-service',
    //   }),
    // });

    // const metricExporter = new OTLPMetricExporter({
    //   url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317',
    // });

    // const metricReader = new PeriodicExportingMetricReader({
    //   exporter: metricExporter,
    //   exportIntervalMillis: 60000, // Export every minute
    // });

    // meterProvider.addMetricReader(metricReader);
    // const meter = meterProvider.getMeter('default');

    // Example OpenTelemetry Counter
    // const requestCounter = meter.createCounter('http_requests_total', {
    //   description: 'Total number of HTTP requests',
    // });
    // this.on('metrics', (metrics: Metric[]) => {
    //   metrics.forEach(metric => {
    //     if (metric.name === MetricNames.HTTP_REQUEST) {
    //       requestCounter.add(metric.value, metric.tags);
    //     }
    //   });
    // });
  }

  /**
   * Increments the value of a counter metric.
   * @param name The name of the metric.
   * @param tags Optional tags to provide additional context.
   */
  increment(name: string, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    const metric = this.metrics.get(key) || {
      name,
      value: 0,
      tags,
      timestamp: Date.now(),
    };

    metric.value++;
    this.metrics.set(key, metric);
  }

  /**
   * Sets the value of a gauge metric.
   * @param name The name of the metric.
   * @param value The value of the gauge.
   * @param tags Optional tags to provide additional context.
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    this.metrics.set(key, {
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Records a timing metric.
   * @param name The name of the metric.
   * @param value The duration of the timing.
   * @param tags Optional tags to provide additional context.
   */
  timing(name: string, value: number, tags: Record<string, string> = {}) {
    const key = this.getMetricKey(name, tags);
    this.metrics.set(key, {
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns all currently collected metrics.
   * @returns An array of Metric objects.
   */
  getMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Generates a unique key for a metric based on its name and tags.
   * @param name The name of the metric.
   * @param tags The tags associated with the metric.
   */
  private getMetricKey(name: string, tags: Record<string, string>): string {
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}${sortedTags ? `,${sortedTags}` : ''}`;
  }

  /**
   * Sets up a periodic task to report collected metrics.
   */
  private setupPeriodicReport() {
    setInterval(() => {
      const metrics = this.getMetrics();
      if (metrics.length > 0) {
        this.logger.info('Application metrics', { metrics });
        this.emit('metrics', metrics);
      }
    }, 60000); // Report every minute
  }
}

// Create a singleton instance
// export const metricsCollector = container.resolve(MetricsCollector);

/**
 * Defines a set of standard metric names for consistent usage.
 */
// Export metric types for consistent naming
export const MetricNames = {
  HTTP_REQUEST: 'http.request',
  HTTP_ERROR: 'http.error',
  DB_OPERATION: 'db.operation',
  DB_ERROR: 'db.error',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker.state',
  MFA_VERIFICATION: 'mfa.verification',
  PROFILE_UPDATE: 'profile.update',
} as const;
