// tests/helpers/dynamodb.helper.ts (Example)
import {
    BillingMode,
    CreateTableCommand,
    DeleteTableCommand,
    DynamoDBClient,
    KeyType,
    ProjectionType,
    ResourceNotFoundException,
    ScalarAttributeType,
    waitUntilTableExists,
    waitUntilTableNotExists
} from "@aws-sdk/client-dynamodb";

export const TEST_TABLE_NAME = process.env.AUTHZ_TABLE_NAME_TEST || 'user-mgmt-authz-test';
export const GSI1_NAME = 'GSI1'; // Match repo constant

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT_URL || 'http://localhost:8000',
    credentials: { // Dummy creds for local
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummykey',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummysecret',
    },
});

// export const testDynamoDbClient = new DynamoDBClient({
//     region: process.env.AWS_REGION || 'us-east-1',
//     endpoint: process.env.DYNAMODB_ENDPOINT_URL || 'http://localhost:8000',
//     // **Explicitly provide dummy credentials for tests**
//     credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummykey', // Use env var or default dummy
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummysecret', // Use env var or default dummy
//     },
//      // Optional: Improve performance for local tests
//      requestHandler: new NodeHttpHandler({
//         connectionTimeout: 2000,
//         socketTimeout: 2000,
//         httpAgent: { keepAlive: true } // Reuse connections
//     }),
// });

// export function getTestDocumentClient(): DynamoDBDocumentClient {
//      return DynamoDBDocumentClient.from(testDynamoDbClient, { // Use the explicit test client
//          marshallOptions: { removeUndefinedValues: true }
//      });
// }
// -

export async function createTestTable(): Promise<void> {
    console.log(`Attempting to create test table: ${TEST_TABLE_NAME}`);
    try {
        const command = new CreateTableCommand({
            TableName: TEST_TABLE_NAME,
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: ScalarAttributeType.S },
                { AttributeName: "SK", AttributeType: ScalarAttributeType.S },
            ],
            KeySchema: [
                { AttributeName: "PK", KeyType: KeyType.HASH },
                { AttributeName: "SK", KeyType: KeyType.RANGE },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: GSI1_NAME,
                    KeySchema: [
                        { AttributeName: "SK", KeyType: KeyType.HASH }, // GSI PK is main SK
                        { AttributeName: "PK", KeyType: KeyType.RANGE }, // GSI SK is main PK
                    ],
                    Projection: {
                        ProjectionType: ProjectionType.ALL // Project all attributes
                    },
                    // Throughput settings are ignored for PAY_PER_REQUEST
                }
            ],
            BillingMode: BillingMode.PAY_PER_REQUEST,
        });
        await client.send(command);
        console.log(`Waiting for table ${TEST_TABLE_NAME} to become active...`);
        await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: TEST_TABLE_NAME });
        console.log(`Table ${TEST_TABLE_NAME} created successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Test table ${TEST_TABLE_NAME} already exists.`);
        } else {
            console.error(`Error creating test table ${TEST_TABLE_NAME}:`, error);
            throw error;
        }
    }
}

export async function deleteTestTable(): Promise<void> {
    console.log(`Attempting to delete test table: ${TEST_TABLE_NAME}`);
    try {
        const command = new DeleteTableCommand({ TableName: TEST_TABLE_NAME });
        await client.send(command);
        console.log(`Waiting for table ${TEST_TABLE_NAME} to be deleted...`);
        await waitUntilTableNotExists({ client, maxWaitTime: 120 }, { TableName: TEST_TABLE_NAME }); // Longer timeout for delete
        console.log(`Table ${TEST_TABLE_NAME} deleted successfully.`);
    } catch (error: any) {
        if (error instanceof ResourceNotFoundException || error.name === 'ResourceNotFoundException') {
            console.log(`Test table ${TEST_TABLE_NAME} not found, skipping deletion.`);
        } else {
            console.error(`Error deleting test table ${TEST_TABLE_NAME}:`, error);
            // Decide if test cleanup failure should fail the suite
            // throw error;
        }
    }
}

export async function clearTestTable(): Promise<void> {
    // Helper to delete all items (Scan + BatchWrite) - Implement if needed for beforeEach cleanup
    console.warn('clearTestTable not implemented - using delete/create for now.');
}

// You might also need a function to get the DocumentClient instance for tests
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
export function getTestDocumentClient() {
    return DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true }
    });
}