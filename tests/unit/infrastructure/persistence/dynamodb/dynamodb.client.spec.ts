import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { IConfigService } from '../../../../../src/application/interfaces/IConfigService';
import { DynamoDBProvider } from '../../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';

// Mock the document client factory
jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({
            send: jest.fn(),
        }),
    },
}));

describe('DynamoDBProvider', () => {
    let configServiceMock: MockProxy<IConfigService>;
    let mockClient: MockProxy<DynamoDBClient>;
    let provider: DynamoDBProvider;

    beforeEach(() => {
        configServiceMock = mock<IConfigService>();
        mockClient = mock<DynamoDBClient>();
        (DynamoDBDocumentClient.from as jest.Mock).mockClear();
    });

    it('should initialize with a provided DynamoDB client and config', () => {
        // configServiceMock.getOrThrow.calledWith('AUTHZ_TABLE_NAME').mockReturnValue('test-table'); // No longer needed

        provider = new DynamoDBProvider(configServiceMock, mockClient);

        // Check that the table name was retrieved from config -> REMOVED
        // expect(configServiceMock.getOrThrow).toHaveBeenCalledWith('AUTHZ_TABLE_NAME');
        // expect(provider.tableName).toBe('test-table');

        // Check that the provided client is used
        expect(provider.client).toBe(mockClient);

        // Check that the document client is created from the provided client
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledWith(mockClient, {
            marshallOptions: { removeUndefinedValues: true },
        });
        expect(provider.documentClient).toBeDefined();
    });

    // it('should throw an error if AUTHZ_TABLE_NAME is missing') -> REMOVED, Provider doesn't check table name

    it('should properly expose client instances', () => { // Renamed
        provider = new DynamoDBProvider(configServiceMock, mockClient);

        expect(provider.client).toBe(mockClient);
        expect(provider.documentClient).toBeDefined();
    });
});