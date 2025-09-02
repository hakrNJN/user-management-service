
import { DynamoDBClient, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const deleteTestTable = async (tableName: string) => {
    const client = new DynamoDBClient({ region: 'ap-south-1' });

    const params = {
        TableName: tableName,
    };

    try {
        await client.send(new DeleteTableCommand(params));
        console.log(`Table ${tableName} deleted successfully. Waiting for it to be deleted...`);
        await waitUntilTableNotExists(client, tableName);
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Table ${tableName} not found.`);
        } else {
            console.error(`Error deleting table ${tableName}:`, error);
            throw error;
        }
    }
};

const waitUntilTableNotExists = async (client: DynamoDBClient, tableName: string) => {
    let tableDeleted = false;
    while (!tableDeleted) {
        try {
            await client.send(new DescribeTableCommand({ TableName: tableName }));
        } catch (error: any) {
            if (error.name === 'ResourceNotFoundException') {
                tableDeleted = true;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

export default async () => {
    await Promise.all([
        deleteTestTable('TestUsers'),
        deleteTestTable('TestPolicies'),
        deleteTestTable('TestRoles'),
        deleteTestTable('TestPermissions'),
        deleteTestTable('TestAssignments'),
    ]);
};
