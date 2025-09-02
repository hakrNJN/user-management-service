import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from 'tsyringe';
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { TYPES } from "../../../shared/constants/types";

@injectable()
export class DynamoDBProvider {
    public readonly client: DynamoDBClient;
    public readonly documentClient: DynamoDBDocumentClient;
    public readonly tableName: string;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        tableName: string, // Add tableName here
        client?: DynamoDBClient // Optional client for testing
    ) {
        this.tableName = tableName;

        if (client) {
            this.client = client;
        } else {
            const region = configService.getOrThrow<string>('AWS_REGION');
            const endpoint = configService.get('DYNAMODB_ENDPOINT_URL');

            const clientConfig: any = {
                region,
                endpoint: endpoint || undefined,
                credentials: {
                    accessKeyId: 'dummy',
                    secretAccessKey: 'dummy',
                },
            };

            // For local DynamoDB, these are often required
            if (endpoint && (endpoint.includes('localhost') || endpoint.includes('127.0.0.1'))) {
                clientConfig.forcePathStyle = true;
                clientConfig.sslEnabled = false;
            }

            this.client = new DynamoDBClient(clientConfig);
        }

        const translateConfig: TranslateConfig = { marshallOptions: { removeUndefinedValues: true } };
        this.documentClient = DynamoDBDocumentClient.from(this.client, translateConfig);
    }
}