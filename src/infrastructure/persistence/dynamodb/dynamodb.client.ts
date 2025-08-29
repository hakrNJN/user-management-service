import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from 'tsyringe';
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { TYPES } from "../../../shared/constants/types";

@injectable()
export class DynamoDBProvider {
    public readonly client: DynamoDBClient;
    public readonly documentClient: DynamoDBDocumentClient;
    public readonly tableName: string; // Add tableName here

    constructor(@inject(TYPES.ConfigService) private configService: IConfigService) {
        const region = this.configService.getOrThrow<string>('AWS_REGION');
        const endpoint = this.configService.get('DYNAMODB_ENDPOINT_URL');
        const isTest = this.configService.get('NODE_ENV') === 'test';

        const clientConfig: any = {
            region,
            endpoint: endpoint || undefined,
            credentials: isTest ? undefined : {
                accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
            },
        };

        this.client = new DynamoDBClient(clientConfig);

        // Create a DocumentClient from the DynamoDBClient
        const translateConfig: TranslateConfig = { marshallOptions: { removeUndefinedValues: true } };
        this.documentClient = DynamoDBDocumentClient.from(this.client, translateConfig);

        this.tableName = this.configService.getOrThrow('AUTHZ_TABLE_NAME'); // Get table name from config
    }
}
