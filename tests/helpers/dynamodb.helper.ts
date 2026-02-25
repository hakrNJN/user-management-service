import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ScalarAttributeType, KeyType, ProjectionType, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { mockConfigService } from "../mocks/config.mock";
import { IConfigService } from "../../src/application/interfaces/IConfigService"; // Added
import { ILogger } from "../../src/application/interfaces/ILogger"; // Added

const config = mockConfigService;

const client = new DynamoDBClient({
    region: "ap-south-1",
});

export const docClient = DynamoDBDocumentClient.from(client);

export async function createTestTable(
    tableName: string,
    keySchema: any[],
    attributeDefinitions: any[],
    globalSecondaryIndexes?: any[]
): Promise<void> {
    const params: any = {
        TableName: tableName,
        KeySchema: keySchema,
        AttributeDefinitions: attributeDefinitions,
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        }
    };

    if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
        params.GlobalSecondaryIndexes = globalSecondaryIndexes;
    }

    try {
        await client.send(new CreateTableCommand(params));
        console.log(`Table ${tableName} created successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table ${tableName} already exists.`);
        } else {
            console.error(`Error creating table ${tableName}:`, error);
            throw error;
        }
    }
}

export async function deleteTestTable(tableName: string): Promise<void> {
    const params = {
        TableName: tableName
    };

    try {
        await client.send(new DeleteTableCommand(params));
        console.log(`Table ${tableName} deleted successfully.`);
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Table ${tableName} not found.`);
        } else if (error.name === 'ResourceInUseException') {
            console.log(`Table ${tableName} is already being deleted/created.`);
        } else {
            console.error(`Error deleting table ${tableName}:`, error);
            throw error;
        }
    }
}

export async function clearTestTable(tableName: string, keySchema: any[]): Promise<void> {
    const scanParams: any = {
        TableName: tableName,
        ProjectionExpression: keySchema.map(k => k.AttributeName).join(', ')
    };

    let items;
    do {
        items = await docClient.send(new ScanCommand(scanParams));
        if (items.Items && items.Items.length > 0) {
            for (const item of items.Items) {
                const Key: { [key: string]: any } = {};
                for (const keyDef of keySchema) {
                    Key[keyDef.AttributeName] = item[keyDef.AttributeName];
                }
                await docClient.send(new DeleteCommand({
                    TableName: tableName,
                    Key: Key
                }));
            }
        }
        scanParams.ExclusiveStartKey = items.LastEvaluatedKey;
    } while (items.LastEvaluatedKey);
    console.log(`Table ${tableName} cleared successfully.`);
}

export async function describeTable( // Added
    tableName: string,
    configService: IConfigService,
    logger: ILogger
): Promise<any | undefined> {
    const client = new DynamoDBClient({
        region: configService.get<string>('AWS_REGION', 'us-east-1')!,
        endpoint: configService.get<string>('DYNAMODB_ENDPOINT_URL', 'http://localhost:8000')!,
        credentials: {
            accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID', 'test')!,
            secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY', 'test')!,
        },
    });
    const params = {
        TableName: tableName,
    };
    try {
        const command = new DescribeTableCommand(params);
        const data = await client.send(command);
        return data.Table;
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
            logger.info(`Table ${tableName} does not exist.`);
            return undefined;
        } else {
            logger.error(`Error describing table ${tableName}:`, error);
            throw error;
        }
    }
}
