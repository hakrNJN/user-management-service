import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { IConfigService } from '../../../../../src/application/interfaces/IConfigService';
import { DynamoDBProvider } from '../../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';

// Mock AWS SDK clients - define mock instances inside the factory functions
jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
        config: {
            region: jest.fn(),
        },
    })),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({
            send: jest.fn(),
        }),
    },
}));

describe('DynamoDBProvider', () => {
    let configServiceMock: MockProxy<IConfigService>;
    let provider: DynamoDBProvider;

    beforeEach(() => {
        configServiceMock = mock<IConfigService>();
        // Clear mocks for AWS SDK clients
        (DynamoDBClient as jest.Mock).mockClear();
        (DynamoDBDocumentClient.from as jest.Mock).mockClear();
    });

    // Helper to set up config service mocks
    const setupConfigMocks = (env: 'production' | 'test', overrides?: Record<string, string>) => {
        const getMockImpl = <T = string>(key: string, defaultValue?: T): T | undefined => {
            if (key === 'NODE_ENV') return env as T;
            if (key === 'DYNAMODB_ENDPOINT_URL') return (overrides?.DYNAMODB_ENDPOINT_URL as T) || defaultValue;
            return defaultValue; // Return defaultValue if key not found
        };
        configServiceMock.get.mockImplementation(getMockImpl);

        const getOrThrowMockImpl = <T = string>(key: string): T => {
            if (key === 'AWS_REGION') return (overrides?.AWS_REGION || 'us-east-1') as T;
            if (key === 'AWS_ACCESS_KEY_ID') return (overrides?.AWS_ACCESS_KEY_ID || 'test-access-key') as T;
            if (key === 'AWS_SECRET_ACCESS_KEY') return (overrides?.AWS_SECRET_ACCESS_KEY || 'test-secret-key') as T;
            if (key === 'AUTHZ_TABLE_NAME') return (overrides?.AUTHZ_TABLE_NAME || 'test-table') as T;
            throw new Error(`Missing required config: ${key}`);
        };
        configServiceMock.getOrThrow.mockImplementation(getOrThrowMockImpl);
    };

    // Test Case 1: Constructor - Production Environment
    it('should initialize DynamoDBClient and DocumentClient for production', () => {
        setupConfigMocks('production');

        provider = new DynamoDBProvider(configServiceMock);

        expect(DynamoDBClient).toHaveBeenCalledTimes(1);
        expect(DynamoDBClient).toHaveBeenCalledWith({
            region: 'us-east-1',
            endpoint: undefined,
            credentials: {
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key',
            },
        });
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledWith(
            expect.objectContaining({
                send: expect.any(Function),
                config: expect.any(Object),
            }),
            { marshallOptions: { removeUndefinedValues: true } }
        );
        expect(provider.tableName).toBe('test-table');
    });

    // Test Case 2: Constructor - Test Environment (Local DynamoDB)
    it('should initialize DynamoDBClient and DocumentClient for test environment with endpoint', () => {
        setupConfigMocks('test', { DYNAMODB_ENDPOINT_URL: 'http://localhost:8000' });

        provider = new DynamoDBProvider(configServiceMock);

        expect(DynamoDBClient).toHaveBeenCalledTimes(1);
        expect(DynamoDBClient).toHaveBeenCalledWith({
            region: 'us-east-1',
            endpoint: 'http://localhost:8000',
            credentials: undefined, // No credentials in test environment
        });
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledWith(
            expect.objectContaining({
                send: expect.any(Function),
                config: expect.any(Object),
            }),
            { marshallOptions: { removeUndefinedValues: true } }
        );
        expect(provider.tableName).toBe('test-table');
    });

    // Test Case 3: Constructor - Missing Required Config
    it('should throw an error if AWS_REGION is missing', () => {
        configServiceMock.get.mockReturnValue('test' as any);
        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            if (key === 'AWS_REGION') throw new Error('Missing AWS_REGION');
            if (key === 'AUTHZ_TABLE_NAME') return 'test-table' as T;
            return 'dummy' as T;
        });

        expect(() => new DynamoDBProvider(configServiceMock)).toThrow('Missing AWS_REGION');
    });

    it('should throw an error if AUTHZ_TABLE_NAME is missing', () => {
        configServiceMock.get.mockReturnValue('test' as any);
        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            if (key === 'AWS_REGION') return 'us-east-1' as T;
            if (key === 'AUTHZ_TABLE_NAME') throw new Error('Missing AUTHZ_TABLE_NAME');
            return 'dummy' as T;
        });

        expect(() => new DynamoDBProvider(configServiceMock)).toThrow('Missing AUTHZ_TABLE_NAME');
    });

    // Additional test cases for better coverage
    it('should properly expose client instances and table name', () => {
        setupConfigMocks('production');

        provider = new DynamoDBProvider(configServiceMock);

        expect(provider.client).toHaveProperty('send');
        expect(provider.client).toHaveProperty('config');
        expect(provider.documentClient).toHaveProperty('send');
        expect(provider.tableName).toBe('test-table');
    });

    it('should handle custom table name from config', () => {
        setupConfigMocks('production', { AUTHZ_TABLE_NAME: 'custom-table-name' });

        provider = new DynamoDBProvider(configServiceMock);

        expect(provider.tableName).toBe('custom-table-name');
    });

    it('should handle missing ACCESS_KEY_ID in production environment', () => {
        configServiceMock.get.mockReturnValue('production' as any);
        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            if (key === 'AWS_REGION') return 'us-east-1' as T;
            if (key === 'AWS_ACCESS_KEY_ID') throw new Error('Missing AWS_ACCESS_KEY_ID');
            if (key === 'AUTHZ_TABLE_NAME') return 'test-table' as T;
            return 'dummy' as T;
        });

        expect(() => new DynamoDBProvider(configServiceMock)).toThrow('Missing AWS_ACCESS_KEY_ID');
    });

    it('should handle missing SECRET_ACCESS_KEY in production environment', () => {
        configServiceMock.get.mockReturnValue('production' as any);
        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            if (key === 'AWS_REGION') return 'us-east-1' as T;
            if (key === 'AWS_ACCESS_KEY_ID') return 'test-access-key' as T;
            if (key === 'AWS_SECRET_ACCESS_KEY') throw new Error('Missing AWS_SECRET_ACCESS_KEY');
            if (key === 'AUTHZ_TABLE_NAME') return 'test-table' as T;
            return 'dummy' as T;
        });

        expect(() => new DynamoDBProvider(configServiceMock)).toThrow('Missing AWS_SECRET_ACCESS_KEY');
    });
});
