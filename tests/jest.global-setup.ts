import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { KeyType, ScalarAttributeType, ProjectionType } from '@aws-sdk/client-dynamodb';

const createTestTable = async (tableName: string, keySchema: any[], attributeDefinitions: any[], globalSecondaryIndexes?: any[]) => {
    const client = new DynamoDBClient({ region: 'ap-south-1' });

    const params: any = {
        TableName: tableName,
        KeySchema: keySchema,
        AttributeDefinitions: attributeDefinitions,
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
    };

    if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
        params.GlobalSecondaryIndexes = globalSecondaryIndexes;
    }

    try {
        await client.send(new CreateTableCommand(params));
        console.log(`Table ${tableName} created successfully. Waiting for it to become active...`);
        await waitUntilTableExists(client, tableName);
    } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table ${tableName} already exists.`);
        } else {
            console.error(`Error creating table ${tableName}:`, error);
            throw error;
        }
    }
};

const waitUntilTableExists = async (client: DynamoDBClient, tableName: string) => {
    let tableReady = false;
    while (!tableReady) {
        try {
            const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
            if (result.Table?.TableStatus === 'ACTIVE') {
                tableReady = true;
            }
        } catch (error) {
            // ignore errors
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

export default async () => {
    await Promise.all([
        createTestTable('TestUsers', [{ AttributeName: 'userId', KeyType: KeyType.HASH }], [{ AttributeName: 'userId', AttributeType: ScalarAttributeType.S }, { AttributeName: 'email', AttributeType: ScalarAttributeType.S }], [{ IndexName: 'email-index', KeySchema: [{ AttributeName: 'email', KeyType: KeyType.HASH }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } }]),
        createTestTable('TestPolicies', [{ AttributeName: 'PK', KeyType: KeyType.HASH }, { AttributeName: 'SK', KeyType: KeyType.RANGE }], [{ AttributeName: 'PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'PolicyNameGSI_PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'PolicyNameGSI_SK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_SK', AttributeType: ScalarAttributeType.S }], [{ IndexName: 'PolicyNameGSI', KeySchema: [{ AttributeName: 'PolicyNameGSI_PK', KeyType: KeyType.HASH }, { AttributeName: 'PolicyNameGSI_SK', KeyType: KeyType.RANGE }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } }, { IndexName: 'EntityTypeGSI', KeySchema: [{ AttributeName: 'EntityTypeGSI_PK', KeyType: KeyType.HASH }, { AttributeName: 'EntityTypeGSI_SK', KeyType: KeyType.RANGE }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } }]),
        createTestTable('TestRoles', [{ AttributeName: 'PK', KeyType: KeyType.HASH }, { AttributeName: 'SK', KeyType: KeyType.RANGE }], [{ AttributeName: 'PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_SK', AttributeType: ScalarAttributeType.S }], [{ IndexName: 'EntityTypeGSI', KeySchema: [{ AttributeName: 'EntityTypeGSI_PK', KeyType: KeyType.HASH }, { AttributeName: 'EntityTypeGSI_SK', KeyType: KeyType.RANGE }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } }]),
        createTestTable('TestPermissions', [{ AttributeName: 'PK', KeyType: KeyType.HASH }, { AttributeName: 'SK', KeyType: KeyType.RANGE }], [{ AttributeName: 'PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_SK', AttributeType: ScalarAttributeType.S }], [{ IndexName: 'EntityTypeGSI', KeySchema: [{ AttributeName: 'EntityTypeGSI_PK', KeyType: KeyType.HASH }, { AttributeName: 'EntityTypeGSI_SK', KeyType: KeyType.RANGE }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } }]),
        createTestTable('TestAssignments', [{ AttributeName: 'PK', KeyType: KeyType.HASH }, { AttributeName: 'SK', KeyType: KeyType.RANGE }], [{ AttributeName: 'PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_PK', AttributeType: ScalarAttributeType.S }, { AttributeName: 'EntityTypeGSI_SK', AttributeType: ScalarAttributeType.S }], [{ IndexName: 'EntityTypeGSI', KeySchema: [{ AttributeName: 'EntityTypeGSI_PK', KeyType: KeyType.HASH }, { AttributeName: 'EntityTypeGSI_SK', KeyType: KeyType.RANGE }], Projection: { ProjectionType: ProjectionType.ALL }, ProvisionedThroughput: { ReadCapacityUnits: 20, WriteCapacityUnits: 20 } }]),
    ]);
};