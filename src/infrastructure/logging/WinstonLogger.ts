import { inject, injectable } from 'tsyringe';
import winston from 'winston';
import CloudWatchTransport from 'winston-cloudwatch';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { IConfigService } from '../../application/interfaces/IConfigService';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { LogFormats } from '../../shared/utils/logFormat';
import { trace, context } from '@opentelemetry/api';

type NodeEnv = 'development' | 'production' | 'test';

@injectable()
export class WinstonLogger implements ILogger {
    private _logger: winston.Logger;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService
    ) {
        this._logger = this.initializeLogger();
    }

    private initializeLogger(): winston.Logger {
        const logLevel = this.configService.get('LOG_LEVEL', 'info');
        const nodeEnv = this.configService.get<NodeEnv>('NODE_ENV', 'development');

        const traceFormat = winston.format((info) => {
            const span = trace.getSpan(context.active());
            if (span) {
                const { traceId, spanId } = span.spanContext();
                info.trace_id = traceId;
                info.span_id = spanId;
            }
            return info;
        });

        // Create base logger with console transport
        const logger = winston.createLogger({
            level: logLevel,
            format: winston.format.combine(traceFormat(), LogFormats.productionFormat), // Always use JSON format
            transports: [
                new winston.transports.Console({
                    level: logLevel
                })
            ]
        });

        // Add CloudWatch transport in production
        if (nodeEnv === 'production') {
            const awsRegion = this.configService.getOrThrow('AWS_REGION');
            const logGroupName = this.configService.getOrThrow('CW_LOG_GROUP_NAME');
            const logStreamName = this.configService.getOrThrow('CW_LOG_STREAM_NAME');

            if (awsRegion && logGroupName) {
                const cloudWatchTransport = new CloudWatchTransport({
                    logGroupName,
                    logStreamName: logStreamName || 'default',
                    awsRegion,
                });

                logger.add(cloudWatchTransport);
                console.info(`[WinstonLogger] CloudWatch transport configured for group "${logGroupName}" and stream "${logStreamName}"`);
            }
        }

        // Add centralized logging configuration here (e.g., ELK stack, Datadog)
        if (nodeEnv === 'production') {
            const elasticsearchHost = this.configService.get('ELASTICSEARCH_HOST');
            if (elasticsearchHost) {
                logger.add(new ElasticsearchTransport({
                    level: logLevel,
                    clientOpts: { node: elasticsearchHost },
                    index: 'user-management-service-logs',
                }));
                console.info(`[WinstonLogger] Elasticsearch transport configured for host "${elasticsearchHost}"`);
            }
        }

        console.info(`[WinstonLogger] Logger initialized with level "${logLevel}" in "${nodeEnv}" environment.`);
        return logger;
    }

    info(message: string, meta?: Record<string, any>): void {
        if (!message) return;
        this._logger.info(message, meta);
    }

    warn(message: string, meta?: Record<string, any>): void {
        if (!message) return;
        this._logger.warn(message, meta);
    }

    error(message: string, error?: Error | any, meta?: Record<string, any>): void {
        if (!message) return;

        let logMeta = meta || {};
        if (error) {
            if (error instanceof Error) {
                logMeta = {
                    ...logMeta,
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    }
                };
            } else {
                logMeta = {
                    ...logMeta,
                    error
                };
            }
        }

        this._logger.error(message, logMeta);
    }

    debug(message: string, meta?: Record<string, any>): void {
        if (!message) return;
        this._logger.debug(message, meta);
    }
}