import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, BatchWriteItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { IConfigService } from "../../src/application/interfaces/IConfigService";
import { TYPES } from "../../src/shared/constants/types";
import { container } from "tsyringe";
import { DynamoDBProvider } from "../../src/infrastructure/persistence/dynamodb/dynamodb.client";

export const TEST_TABLE_NAME = "TestAuthzTable";

// Use a single client instance for all helper functions
let testDynamoDBClient: DynamoDBClient;
let testDynamoDBDocumentClient: DynamoDBDocumentClient;

const getTestClient = () => {
    if (!testDynamoDBClient) {
        testDynamoDBClient = new DynamoDBClient({
            region: "us-east-1", // Or any region, as long as endpoint is local
            endpoint: process.env.DYNAMODB_ENDPOINT_URL || "http://localhost:8000",
            credentials: {
                accessKeyId: "test",
                secretAccessKey: "test",
            },
        });
        const translateConfig: TranslateConfig = { marshallOptions: { removeUndefinedValues: true } };
        testDynamoDBDocumentClient = DynamoDBDocumentClient.from(testDynamoDBClient, translateConfig);
    }
    return { client: testDynamoDBClient, documentClient: testDynamoDBDocumentClient };
};

export const createTestTable = async () => {
    const { client } = getTestClient();
    const command = new CreateTableCommand({
        TableName: TEST_TABLE_NAME,
        KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
            { AttributeName: "EntityTypeGSI_PK", AttributeType: "S" }, // For GSI
            { AttributeName: "EntityTypeGSI_SK", AttributeType: "S" }, // For GSI
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
        GlobalSecondaryIndexes: [
            {
                IndexName: "EntityTypeGSI",
                KeySchema: [
                    { AttributeName: "EntityTypeGSI_PK", KeyType: "HASH" },
                    { AttributeName: "EntityTypeGSI_SK", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                },
            },
        ],
    });
    try {
        await client.send(command);
        console.log(`Table ${TEST_TABLE_NAME} created successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
            console.warn(`Table ${TEST_TABLE_NAME} already exists.`);
        } else {
            console.error(`Error creating table ${TEST_TABLE_NAME}:`, error);
            throw error;
        }
    }
};

export const deleteTestTable = async () => {
    const { client } = getTestClient();
    const command = new DeleteTableCommand({
        TableName: TEST_TABLE_NAME,
    });
    try {
        await client.send(command);
        console.log(`Table ${TEST_TABLE_NAME} deleted successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
            console.warn(`Table ${TEST_TABLE_NAME} not found for deletion.`);
        } else {
            console.error(`Error deleting table ${TEST_TABLE_NAME}:`, error);
            throw error;
        }
    }
};

export const clearTestTable = async () => {
    const { documentClient } = getTestClient();
    const scanCommand = new ScanCommand({
        TableName: TEST_TABLE_NAME,
        ProjectionExpression: "PK, SK", // Only fetch keys
    });

    let items;
    const itemsToDelete: any[] = [];
    do {
        const result = await documentClient.send(scanCommand);
        items = result.Items;
        if (items) {
            items.forEach((item) => {
                itemsToDelete.push({
                    DeleteRequest: {
                        Key: unmarshall(item),
                    },
                });
            });
        }
        scanCommand.input.ExclusiveStartKey = result.LastEvaluatedKey; // For pagination
    } while (scanCommand.input.ExclusiveStartKey);

    if (itemsToDelete.length > 0) {
        const batchSize = 25; // Max items for BatchWriteItem
        for (let i = 0; i < itemsToDelete.length; i += batchSize) {
            const batch = itemsToDelete.slice(i, i + batchSize);
            const command = new BatchWriteItemCommand({
                RequestItems: {
                    [TEST_TABLE_NAME]: batch,
                },
            });
            try {
                await documentClient.send(command);
            } catch (error) {
                console.error(`Error during batch delete:`, error);
                throw error;
            }
        }
        console.log(`Cleared ${itemsToDelete.length} items from ${TEST_TABLE_NAME}.`);
    } else {
        console.log(`Table ${TEST_TABLE_NAME} is already empty.`);
    }
};

export const destroyDynamoDBClient = () => {
    if (testDynamoDBClient) {
        testDynamoDBClient.destroy();
        testDynamoDBClient = null as any; // Reset for next test run
        testDynamoDBDocumentClient = null as any;
        console.log("DynamoDB test client destroyed.");
    }
};

// Setup for integration tests
export const setupIntegrationTest = () => {
    // Mock ConfigService to return the test table name
    const configServiceMock = {
        getOrThrow: jest.fn((key: string) => {
            if (key === 'AUTHZ_TABLE_NAME') return TEST_TABLE_NAME;
            throw new Error(`Unexpected config key: ${key}`);
        }),
        get: jest.fn((key: string, defaultValue?: any) => {
            if (key === 'DYNAMODB_ENDPOINT_URL') return process.env.DYNAMODB_ENDPOINT_URL || "http://localhost:8000";
            if (key === 'AWS_REGION') return "us-east-1";
            if (key === 'NODE_ENV') return "test";
            return defaultValue;
        }),
    };

    container.reset(); // Clear previous registrations
    container.register(TYPES.ConfigService, { useValue: configServiceMock });
    container.registerSingleton(TYPES.DynamoDBProvider, DynamoDBProvider); // Register the real provider

    // Ensure logger is mocked or configured to avoid console spam during tests
    const loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };
    container.register(TYPES.Logger, { useValue: loggerMock });
};

// Re-export DynamoDBProvider for direct injection if needed
export { DynamoDBProvider } from '../../src/infrastructure/persistence/dynamodb/dynamodb.client';