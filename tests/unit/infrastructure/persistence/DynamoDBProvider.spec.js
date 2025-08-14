"use strict";
// tests/unit/infrastructure/persistence/DynamoDBProvider.spec.ts
Object.defineProperty(exports, "__esModule", { value: true });
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const dynamodb_client_1 = require("../../../../src/infrastructure/persistence/dynamodb/dynamodb.client");
const config_mock_1 = require("../../../mocks/config.mock"); // Assuming you have a shared mock helper
// Mock the DynamoDBClient constructor
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
    // Mock any methods if needed, but usually just checking constructor call is enough
    })),
}));
describe('DynamoDBProvider', () => {
    let configService;
    beforeEach(() => {
        jest.clearAllMocks();
        // Use a fresh mock for each test to avoid interference
        configService = Object.assign({}, config_mock_1.mockConfigService); // Clone the base mock
    });
    it('should create a DynamoDBClient with region from config', () => {
        const region = 'eu-west-1';
        configService.getOrThrow.mockReturnValueOnce(region); // Mock get specifically for AWS_REGION
        const provider = new dynamodb_client_1.DynamoDBProvider(configService);
        expect(provider.client).toBeDefined();
        expect(client_dynamodb_1.DynamoDBClient).toHaveBeenCalledTimes(1);
        expect(client_dynamodb_1.DynamoDBClient).toHaveBeenCalledWith({ region });
        expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_REGION');
    });
    it('should throw an error if AWS_REGION is missing', () => {
        configService.get.mockReturnValueOnce(undefined); // Simulate missing region
        expect(() => new dynamodb_client_1.DynamoDBProvider(configService))
            .toThrow('AWS_REGION configuration is missing for DynamoDB client.');
        expect(client_dynamodb_1.DynamoDBClient).not.toHaveBeenCalled();
    });
});
