// tests/unit/infrastructure/persistence/DynamoDBProvider.spec.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { DynamoDBProvider } from '../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { mockConfigService } from '../../../mocks/config.mock'; // Assuming you have a shared mock helper

// Mock the DynamoDBClient constructor
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        // Mock any methods if needed, but usually just checking constructor call is enough
    })),
}));

describe('DynamoDBProvider', () => {
    let configService: jest.Mocked<IConfigService>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Use a fresh mock for each test to avoid interference
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>; // Clone the base mock
    });

    it('should create a DynamoDBClient with region from config', () => {
        const region = 'eu-west-1';
        configService.getOrThrow.mockReturnValueOnce(region); // Mock get specifically for AWS_REGION

        const provider = new DynamoDBProvider(configService);

        expect(provider.client).toBeDefined();
        expect(DynamoDBClient).toHaveBeenCalledTimes(1);
        expect(DynamoDBClient).toHaveBeenCalledWith({ region });
        expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_REGION');
    });

    it('should throw an error if AWS_REGION is missing', () => {
        configService.get.mockReturnValueOnce(undefined); // Simulate missing region

        expect(() => new DynamoDBProvider(configService))
            .toThrow('AWS_REGION configuration is missing for DynamoDB client.');
        expect(DynamoDBClient).not.toHaveBeenCalled();
    });
});