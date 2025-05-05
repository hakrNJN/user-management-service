// tests/helpers/dynamodb.helper.ts (Example)
import {
    AttributeDefinition,
    BillingMode,
    CreateTableCommand,
    DeleteTableCommand,
    DynamoDBClient,
    GlobalSecondaryIndex,
    KeySchemaElement,
    KeyType,
    ProjectionType,
    ResourceNotFoundException,
    ScalarAttributeType,
    waitUntilTableExists,
    waitUntilTableNotExists
} from "@aws-sdk/client-dynamodb";

export const TEST_TABLE_NAME = process.env.AUTHZ_TABLE_NAME || 'user-mgmt-authz-test';
export const GSI1_NAME = 'GSI1'; // For reverse lookups (SK as PK, PK as SK)
export const ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI'; // For listing entities by type

// --- Client Setup ---
// Create a single client instance for the helper module
// Ensure it uses credentials and endpoint suitable for testing (likely DynamoDB Local)
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT_URL || 'http://localhost:8000',
    // Provide dummy credentials for local testing if needed (SDK might pick up defaults otherwise)
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummykey',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummysecret',
    },
});
// Log the endpoint being used for verification during test runs
console.log(`DynamoDB Helper: Using endpoint: ${process.env.DYNAMODB_ENDPOINT_URL || 'http://localhost:8000'}`);


// export function getTestDocumentClient(): DynamoDBDocumentClient {
//      return DynamoDBDocumentClient.from(client, { // Use the explicit test client
//          marshallOptions: { removeUndefinedValues: true }
//      });
// }
// -

export async function createTestTable(): Promise<void> {
    console.log(`Attempting to create test table: ${TEST_TABLE_NAME}`);
     // Define attributes used in base table and GSIs
     const attributeDefinitions: AttributeDefinition[] = [
        { AttributeName: "PK", AttributeType: ScalarAttributeType.S }, // Main Partition Key
        { AttributeName: "SK", AttributeType: ScalarAttributeType.S }, // Main Sort Key
        { AttributeName: "EntityType", AttributeType: ScalarAttributeType.S }, // GSI PK for EntityTypeGSI
        // Add attributes for GSI1 if different from PK/SK (not needed if GSI1 uses PK/SK)
        // { AttributeName: "GSI1PK", AttributeType: ScalarAttributeType.S }, // Example if GSI1PK is different
        // { AttributeName: "GSI1SK", AttributeType: ScalarAttributeType.S }, // Example if GSI1SK is different
    ];

    // Define base table key schema
    const keySchema: KeySchemaElement[] = [
        { AttributeName: "PK", KeyType: KeyType.HASH },
        { AttributeName: "SK", KeyType: KeyType.RANGE },
    ];

    // Define Global Secondary Indexes
    const globalSecondaryIndexes: GlobalSecondaryIndex[] = [
        // GSI for reverse lookups (e.g., find groups for role)
        {
            IndexName: GSI1_NAME,
            KeySchema: [
                { AttributeName: "SK", KeyType: KeyType.HASH }, // GSI PK is the main table's SK
                { AttributeName: "PK", KeyType: KeyType.RANGE }, // GSI SK is the main table's PK
            ],
            Projection: {
                ProjectionType: ProjectionType.ALL // Project all attributes
            },
            // Throughput ignored for PAY_PER_REQUEST
        },
        // GSI for listing by entity type (e.g., list all roles)
        {
            IndexName: ENTITY_TYPE_GSI_NAME,
            KeySchema: [
                { AttributeName: "EntityType", KeyType: KeyType.HASH }, // GSI PK is EntityType
                { AttributeName: "PK", KeyType: KeyType.RANGE }, // GSI SK is main table PK (allows sorting/filtering by PK within type)
            ],
            Projection: {
                ProjectionType: ProjectionType.ALL
            },
        }
    ];


    try {
        const command = new CreateTableCommand({
            TableName: TEST_TABLE_NAME,
            AttributeDefinitions: attributeDefinitions,
            KeySchema: keySchema,
            GlobalSecondaryIndexes: globalSecondaryIndexes,
            BillingMode: BillingMode.PAY_PER_REQUEST,
        });
        await client.send(command); // Use the helper's client instance
        console.log(`Waiting for table ${TEST_TABLE_NAME} to become active...`);
        // Wait until the table exists and is active
        await waitUntilTableExists({ client: client, maxWaitTime: 60 }, { TableName: TEST_TABLE_NAME });
        console.log(`Table ${TEST_TABLE_NAME} created successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Test table ${TEST_TABLE_NAME} already exists.`);
            // Consider deleting and recreating for a clean slate if necessary
            // await deleteTestTable();
            // await createTestTable();
        } else {
            console.error(`Error creating test table ${TEST_TABLE_NAME}:`, error);
            throw error; // Fail fast if table creation has other errors
        }
    }
}

export async function deleteTestTable(): Promise<void> {
    console.log(`Attempting to delete test table: ${TEST_TABLE_NAME}`);
    try {
        const command = new DeleteTableCommand({ TableName: TEST_TABLE_NAME });
        await client.send(command); // Use the helper's client instance
        console.log(`Waiting for table ${TEST_TABLE_NAME} to be deleted...`);
        // Wait until the table is deleted
        await waitUntilTableNotExists({ client: client, maxWaitTime: 120 }, { TableName: TEST_TABLE_NAME });
        console.log(`Table ${TEST_TABLE_NAME} deleted successfully.`);
    } catch (error: any) {
        if (error instanceof ResourceNotFoundException || error.name === 'ResourceNotFoundException') {
            console.log(`Test table ${TEST_TABLE_NAME} not found, skipping deletion.`);
        } else {
            console.error(`Error deleting test table ${TEST_TABLE_NAME}:`, error);
            // Optionally re-throw to make test suite aware of cleanup issues
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
let testDocClientInstance: DynamoDBDocumentClient | null = null;
export function getTestDocumentClient(): DynamoDBDocumentClient {
     if (!testDocClientInstance) {
        testDocClientInstance = DynamoDBDocumentClient.from(client, { // Use the base client from the helper
            marshallOptions: { removeUndefinedValues: true }
        });
     }
     return testDocClientInstance;
}