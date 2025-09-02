import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mock, MockProxy } from 'jest-mock-extended';
import { DynamoDBProvider } from '../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { injectable } from 'tsyringe';
// No need to import StaticCredentialProvider if we use a direct object

import { mockConfigService } from '../mocks/config.mock';

export const mockDynamoDBProvider: MockProxy<DynamoDBProvider> = mock<DynamoDBProvider>();

const testDynamoDBClient = new DynamoDBClient({
    region: 'local-test-region',
    endpoint: 'http://localhost:8000',
    credentials: { // Directly provide the credentials object
        accessKeyId: 'test',
        secretAccessKey: 'test',
    },
    forcePathStyle: true,
    sslEnabled: false,
} as any); // Still need to cast to any for forcePathStyle and sslEnabled

(mockDynamoDBProvider as any).client = testDynamoDBClient;

@injectable()
export class MockDynamoDBProviderClass extends DynamoDBProvider {
    constructor() {
        super(mockConfigService, mockConfigService.getOrThrow('AUTHZ_TABLE_NAME'), testDynamoDBClient);
        return mockDynamoDBProvider;
    }
}
