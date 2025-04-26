import { inject, injectable } from 'tsyringe';
import winston from 'winston';
import CloudWatchTransport from 'winston-cloudwatch';
import { IConfigService } from '../../application/interfaces/IConfigService';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { LogFormats } from '../../shared/utils/logFormat';

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

        // Create base logger with console transport
        const logger = winston.createLogger({
            level: logLevel,
            format: nodeEnv === 'production' ? LogFormats.productionFormat : LogFormats.developmentFormat,
            transports: [
                new winston.transports.Console({
                    level: logLevel
                })
            ]
        });

        // Add CloudWatch transport in production
        if (nodeEnv === 'production') {
            const awsRegion = this.configService.get('AWS_REGION');
            const logGroupName = this.configService.get('CW_LOG_GROUP_NAME');
            const logStreamName = this.configService.get('CW_LOG_STREAM_NAME');

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