import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';

// Mock transport instances that will be returned by constructors
const mockCloudWatchTransportInstance = {
    on: jest.fn(),
    kthxbye: jest.fn()
};

const mockElasticsearchTransportInstance = {
    on: jest.fn()
};

// Mock modules before importing
jest.mock('winston-cloudwatch', () => {
    return jest.fn(() => mockCloudWatchTransportInstance);
});

jest.mock('winston-elasticsearch', () => ({
    ElasticsearchTransport: jest.fn(() => mockElasticsearchTransportInstance)
}));

// Mock the LogFormats module
const mockProductionFormat = { type: 'mockProductionFormat' };
jest.mock('../../../../src/shared/utils/logFormat', () => ({
    LogFormats: {
        productionFormat: mockProductionFormat,
    },
}));

import winston from 'winston';
import CloudWatchTransport from 'winston-cloudwatch';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { WinstonLogger } from '../../../../src/infrastructure/logging/WinstonLogger';

// Mock Winston and its transports
const mockWinstonLoggerInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    add: jest.fn(),
};

const mockConsoleTransportInstance = {
    log: jest.fn(),
    level: 'info',
};

jest.mock('winston', () => ({
    createLogger: jest.fn(() => mockWinstonLoggerInstance),
    transports: {
        Console: jest.fn(() => mockConsoleTransportInstance),
    },
    format: {
        json: jest.fn(),
        combine: jest.fn(),
        timestamp: jest.fn(),
        printf: jest.fn(),
    },
}));

describe('WinstonLogger', () => {
    let configServiceMock: MockProxy<IConfigService>;
    let winstonLogger: WinstonLogger;

    beforeEach(() => {
        configServiceMock = mock<IConfigService>();

        // Clear all mocks before each test
        jest.clearAllMocks();

        // Default mock implementations
        configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
            const values: { [key: string]: any } = {
                'LOG_LEVEL': defaultValue ?? 'info',
                'NODE_ENV': defaultValue ?? 'development',
                'ELASTICSEARCH_HOST': defaultValue
            };
            return values[key] as T;
        });

        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            const values: { [key: string]: string } = {
                'AWS_REGION': 'us-east-1',
                'CW_LOG_GROUP_NAME': 'test-log-group',
                'CW_LOG_STREAM_NAME': 'test-log-stream'
            };
            if (key in values) {
                return values[key] as T;
            }
            throw new Error(`Missing required key: ${key}`);
        });
    });

    describe('initializeLogger', () => {
        it('should initialize logger with default level and console transport', () => {
            winstonLogger = new WinstonLogger(configServiceMock);

            expect(configServiceMock.get).toHaveBeenCalledWith('LOG_LEVEL', 'info');
            expect(configServiceMock.get).toHaveBeenCalledWith('NODE_ENV', 'development');
            expect(winston.createLogger).toHaveBeenCalledTimes(1);
            expect(winston.createLogger).toHaveBeenCalledWith({
                level: 'info',
                format: mockProductionFormat,
                transports: [mockConsoleTransportInstance],
            });
            expect(winston.transports.Console).toHaveBeenCalledTimes(1);
            expect(winston.transports.Console).toHaveBeenCalledWith({ level: 'info' });
        });

        it('should initialize logger with custom log level', () => {
            configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'LOG_LEVEL') return 'debug' as T;
                if (key === 'NODE_ENV') return defaultValue;
                return undefined;
            });

            winstonLogger = new WinstonLogger(configServiceMock);

            expect(winston.createLogger).toHaveBeenCalledWith(expect.objectContaining({
                level: 'debug',
            }));
            expect(winston.transports.Console).toHaveBeenCalledWith({ level: 'debug' });
        });

        it('should add CloudWatch transport in production environment', () => {
            configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
                const values: { [key: string]: string } = {
                    'NODE_ENV': 'production',
                    'LOG_LEVEL': 'info'
                };
                return values[key] as T;
            });

            winstonLogger = new WinstonLogger(configServiceMock);

            expect(CloudWatchTransport).toHaveBeenCalledTimes(1);
            expect(CloudWatchTransport).toHaveBeenCalledWith({
                logGroupName: 'test-log-group',
                logStreamName: 'test-log-stream',
                awsRegion: 'us-east-1',
            });
            expect(mockWinstonLoggerInstance.add).toHaveBeenCalledWith(mockCloudWatchTransportInstance);
        });

        it('should add Elasticsearch transport in production environment if host is provided', () => {
            configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
                const values: { [key: string]: string } = {
                    'NODE_ENV': 'production',
                    'LOG_LEVEL': 'info',
                    'ELASTICSEARCH_HOST': 'http://localhost:9200'
                };
                return values[key] as T;
            });

            winstonLogger = new WinstonLogger(configServiceMock);

            expect(ElasticsearchTransport).toHaveBeenCalledTimes(1);
            expect(ElasticsearchTransport).toHaveBeenCalledWith({
                level: 'info',
                clientOpts: { node: 'http://localhost:9200' },
                index: 'user-management-service-logs',
            });
            expect(mockWinstonLoggerInstance.add).toHaveBeenCalledWith(mockElasticsearchTransportInstance);
        });

        it('should not add CloudWatch or Elasticsearch transports in non-production environment', () => {
            configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
                const values: { [key: string]: string } = {
                    'NODE_ENV': 'development',
                    'LOG_LEVEL': 'info'
                };
                return values[key] as T;
            });

            winstonLogger = new WinstonLogger(configServiceMock);

            expect(CloudWatchTransport).not.toHaveBeenCalled();
            expect(ElasticsearchTransport).not.toHaveBeenCalled();
            expect(mockWinstonLoggerInstance.add).not.toHaveBeenCalled();
        });
    });

    describe('logging methods', () => {
        beforeEach(() => {
            configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
                const values: { [key: string]: string } = {
                    'LOG_LEVEL': 'debug',
                    'NODE_ENV': 'development'
                };
                return values[key] as T;
            });
            winstonLogger = new WinstonLogger(configServiceMock);
        });

        it('info should call _logger.info', () => {
            winstonLogger.info('Test info message', { key: 'value' });
            expect(mockWinstonLoggerInstance.info).toHaveBeenCalledWith('Test info message', { key: 'value' });
        });

        it('info should not call _logger.info if message is empty', () => {
            winstonLogger.info('');
            expect(mockWinstonLoggerInstance.info).not.toHaveBeenCalled();
        });

        it('warn should call _logger.warn', () => {
            winstonLogger.warn('Test warn message', { key: 'value' });
            expect(mockWinstonLoggerInstance.warn).toHaveBeenCalledWith('Test warn message', { key: 'value' });
        });

        it('warn should not call _logger.warn if message is empty', () => {
            winstonLogger.warn('');
            expect(mockWinstonLoggerInstance.warn).not.toHaveBeenCalled();
        });

        it('error should call _logger.error with Error instance', () => {
            const testError = new Error('Something went wrong');
            winstonLogger.error('Test error message', testError, { context: 'test' });
            expect(mockWinstonLoggerInstance.error).toHaveBeenCalledWith(
                'Test error message',
                expect.objectContaining({
                    context: 'test',
                    error: {
                        name: 'Error',
                        message: 'Something went wrong',
                        stack: testError.stack,
                    },
                })
            );
        });

        it('error should call _logger.error with generic error object', () => {
            const genericError = { code: 500, details: 'Failed' };
            winstonLogger.error('Test error message', genericError);
            expect(mockWinstonLoggerInstance.error).toHaveBeenCalledWith(
                'Test error message',
                expect.objectContaining({
                    error: genericError,
                })
            );
        });

        it('error should not call _logger.error if message is empty', () => {
            winstonLogger.error('');
            expect(mockWinstonLoggerInstance.error).not.toHaveBeenCalled();
        });

        it('debug should call _logger.debug', () => {
            winstonLogger.debug('Test debug message', { key: 'value' });
            expect(mockWinstonLoggerInstance.debug).toHaveBeenCalledWith('Test debug message', { key: 'value' });
        });

        it('debug should not call _logger.debug if message is empty', () => {
            winstonLogger.debug('');
            expect(mockWinstonLoggerInstance.debug).not.toHaveBeenCalled();
        });
    });
});
