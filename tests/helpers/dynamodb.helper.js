"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITY_TYPE_GSI_NAME = exports.GSI1_NAME = exports.TEST_TABLE_NAME = void 0;
exports.createTestTable = createTestTable;
exports.deleteTestTable = deleteTestTable;
exports.clearTestTable = clearTestTable;
exports.getTestDocumentClient = getTestDocumentClient;
// tests/helpers/dynamodb.helper.ts (Example)
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
exports.TEST_TABLE_NAME = process.env.AUTHZ_TABLE_NAME || 'user-mgmt-authz-test';
exports.GSI1_NAME = 'GSI1'; // For reverse lookups (SK as PK, PK as SK)
exports.ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI'; // For listing entities by type
// --- Client Setup ---
// Create a single client instance for the helper module
// Ensure it uses credentials and endpoint suitable for testing (likely DynamoDB Local)
const client = new client_dynamodb_1.DynamoDBClient({
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
function createTestTable() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Attempting to create test table: ${exports.TEST_TABLE_NAME}`);
        // Define attributes used in base table and GSIs
        const attributeDefinitions = [
            { AttributeName: "PK", AttributeType: client_dynamodb_1.ScalarAttributeType.S }, // Main Partition Key
            { AttributeName: "SK", AttributeType: client_dynamodb_1.ScalarAttributeType.S }, // Main Sort Key
            { AttributeName: "EntityType", AttributeType: client_dynamodb_1.ScalarAttributeType.S }, // GSI PK for EntityTypeGSI
            // Add attributes for GSI1 if different from PK/SK (not needed if GSI1 uses PK/SK)
            // { AttributeName: "GSI1PK", AttributeType: ScalarAttributeType.S }, // Example if GSI1PK is different
            // { AttributeName: "GSI1SK", AttributeType: ScalarAttributeType.S }, // Example if GSI1SK is different
        ];
        // Define base table key schema
        const keySchema = [
            { AttributeName: "PK", KeyType: client_dynamodb_1.KeyType.HASH },
            { AttributeName: "SK", KeyType: client_dynamodb_1.KeyType.RANGE },
        ];
        // Define Global Secondary Indexes
        const globalSecondaryIndexes = [
            // GSI for reverse lookups (e.g., find groups for role)
            {
                IndexName: exports.GSI1_NAME,
                KeySchema: [
                    { AttributeName: "SK", KeyType: client_dynamodb_1.KeyType.HASH }, // GSI PK is the main table's SK
                    { AttributeName: "PK", KeyType: client_dynamodb_1.KeyType.RANGE }, // GSI SK is the main table's PK
                ],
                Projection: {
                    ProjectionType: client_dynamodb_1.ProjectionType.ALL // Project all attributes
                },
                // Throughput ignored for PAY_PER_REQUEST
            },
            // GSI for listing by entity type (e.g., list all roles)
            {
                IndexName: exports.ENTITY_TYPE_GSI_NAME,
                KeySchema: [
                    { AttributeName: "EntityType", KeyType: client_dynamodb_1.KeyType.HASH }, // GSI PK is EntityType
                    { AttributeName: "PK", KeyType: client_dynamodb_1.KeyType.RANGE }, // GSI SK is main table PK (allows sorting/filtering by PK within type)
                ],
                Projection: {
                    ProjectionType: client_dynamodb_1.ProjectionType.ALL
                },
            }
        ];
        try {
            const command = new client_dynamodb_1.CreateTableCommand({
                TableName: exports.TEST_TABLE_NAME,
                AttributeDefinitions: attributeDefinitions,
                KeySchema: keySchema,
                GlobalSecondaryIndexes: globalSecondaryIndexes,
                BillingMode: client_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            });
            yield client.send(command); // Use the helper's client instance
            console.log(`Waiting for table ${exports.TEST_TABLE_NAME} to become active...`);
            // Wait until the table exists and is active
            yield (0, client_dynamodb_1.waitUntilTableExists)({ client: client, maxWaitTime: 60 }, { TableName: exports.TEST_TABLE_NAME });
            console.log(`Table ${exports.TEST_TABLE_NAME} created successfully.`);
        }
        catch (error) {
            if (error.name === 'ResourceInUseException') {
                console.log(`Test table ${exports.TEST_TABLE_NAME} already exists.`);
                // Consider deleting and recreating for a clean slate if necessary
                // await deleteTestTable();
                // await createTestTable();
            }
            else {
                console.error(`Error creating test table ${exports.TEST_TABLE_NAME}:`, error);
                throw error; // Fail fast if table creation has other errors
            }
        }
    });
}
function deleteTestTable() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Attempting to delete test table: ${exports.TEST_TABLE_NAME}`);
        try {
            const command = new client_dynamodb_1.DeleteTableCommand({ TableName: exports.TEST_TABLE_NAME });
            yield client.send(command); // Use the helper's client instance
            console.log(`Waiting for table ${exports.TEST_TABLE_NAME} to be deleted...`);
            // Wait until the table is deleted
            yield (0, client_dynamodb_1.waitUntilTableNotExists)({ client: client, maxWaitTime: 120 }, { TableName: exports.TEST_TABLE_NAME });
            console.log(`Table ${exports.TEST_TABLE_NAME} deleted successfully.`);
        }
        catch (error) {
            if (error instanceof client_dynamodb_1.ResourceNotFoundException || error.name === 'ResourceNotFoundException') {
                console.log(`Test table ${exports.TEST_TABLE_NAME} not found, skipping deletion.`);
            }
            else {
                console.error(`Error deleting test table ${exports.TEST_TABLE_NAME}:`, error);
                // Optionally re-throw to make test suite aware of cleanup issues
                // throw error;
            }
        }
    });
}
function clearTestTable() {
    return __awaiter(this, void 0, void 0, function* () {
        // Helper to delete all items (Scan + BatchWrite) - Implement if needed for beforeEach cleanup
        console.warn('clearTestTable not implemented - using delete/create for now.');
    });
}
// You might also need a function to get the DocumentClient instance for tests
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
let testDocClientInstance = null;
function getTestDocumentClient() {
    if (!testDocClientInstance) {
        testDocClientInstance = lib_dynamodb_1.DynamoDBDocumentClient.from(client, {
            marshallOptions: { removeUndefinedValues: true }
        });
    }
    return testDocClientInstance;
}
