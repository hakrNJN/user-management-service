import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand, QueryCommand, ScanCommand, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { mock, MockProxy } from 'jest-mock-extended';

// Create a single mock instance of DynamoDBClient
export const mockDynamoDBClient: MockProxy<DynamoDBClient> = mock<DynamoDBClient>();

// Mock the send method to return predefined responses
mockDynamoDBClient.send.mockImplementation(async (command: any) => {
    if (command instanceof PutItemCommand) {
        // Simulate successful PutItem
        return { $metadata: { httpStatusCode: 200 } };
    } else if (command instanceof GetItemCommand) {
        // Simulate successful GetItem with a dummy item
        // You might need to return specific items based on your test scenarios
        return { Item: { PK: { S: 'mockPK' }, SK: { S: 'mockSK' } } };
    } else if (command instanceof UpdateItemCommand) {
        // Simulate successful UpdateItem
        return { $metadata: { httpStatusCode: 200 } };
    } else if (command instanceof DeleteItemCommand) {
        // Simulate successful DeleteItem
        return { $metadata: { httpStatusCode: 200 } };
    } else if (command instanceof QueryCommand) {
        // Simulate successful Query with dummy items
        return { Items: [], Count: 0, ScannedCount: 0 };
    } else if (command instanceof ScanCommand) {
        // Simulate successful Scan with dummy items
        return { Items: [], Count: 0, ScannedCount: 0 };
    } else if (command instanceof CreateTableCommand) {
        // Simulate successful CreateTable
        return { $metadata: { httpStatusCode: 200 } };
    } else if (command instanceof DeleteTableCommand) {
        // Simulate successful DeleteTable
        return { $metadata: { httpStatusCode: 200 } };
    } else if (command instanceof DescribeTableCommand) {
        // Simulate successful DescribeTable with a dummy table description
        return { Table: { TableStatus: 'ACTIVE' } };
    }
    // Fallback for unhandled commands
    throw new Error(`Unhandled DynamoDB command: ${command.constructor.name}`);
});

// Export the mocked DynamoDBClient and all commands
export { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand, QueryCommand, ScanCommand, CreateTableCommand, DeleteTableCommand, DescribeTableCommand };
