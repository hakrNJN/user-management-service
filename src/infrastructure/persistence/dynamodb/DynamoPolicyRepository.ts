import { DynamoDBClient, ScanCommand, ScanCommandInput, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, QueryCommandOutput, GetItemCommandOutput, PutItemCommandOutput, DeleteItemCommandOutput, AttributeValue, ScanCommandOutput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { Policy } from "../../../domain/entities/Policy";
import { IPolicyRepository } from "../../../application/interfaces/IPolicyRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { ILogger } from "../../../application/interfaces/ILogger";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";
import { IConfigService } from "../../../application/interfaces/IConfigService";

@injectable()
export class DynamoPolicyRepository implements IPolicyRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.DynamoDBProvider) private dynamoDBProvider: DynamoDBProvider,
        @inject(TYPES.Logger) private logger: ILogger
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        this.client = this.dynamoDBProvider.client;
        this.logger.info(`DynamoPolicyRepository initialized with table: ${this.tableName}`);
    }

    private mapToPolicy(item: Record<string, any>): Policy {
        const unmarshalled = unmarshall(item);
        return new Policy(
            unmarshalled.id,
            unmarshalled.policyName,
            unmarshalled.policyDefinition,
            unmarshalled.policyLanguage,
            unmarshalled.version,
            unmarshalled.description,
            unmarshalled.metadata,
            new Date(unmarshalled.createdAt),
            new Date(unmarshalled.updatedAt)
        );
    }

    async save(policy: Policy): Promise<void> {
        this.logger.info(`Saving policy: ${policy.id} version ${policy.version}`);
        const item = marshall({
            PK: `POLICY#${policy.id}`,
            SK: `POLICY#${policy.id}`,
            EntityType: "Policy",
            id: policy.id,
            policyName: policy.policyName,
            policyDefinition: policy.policyDefinition,
            policyLanguage: policy.policyLanguage,
            version: policy.version,
            description: policy.description,
            metadata: policy.metadata,
            createdAt: policy.createdAt.toISOString(),
            updatedAt: policy.updatedAt.toISOString(),
            // GSI attributes
            EntityTypeGSI_PK: "Policy",
            EntityTypeGSI_SK: `POLICY#${policy.id}`,
            PolicyNameGSI_PK: policy.policyName,
            PolicyNameGSI_SK: `POLICY#${policy.id}`,
        }, { removeUndefinedValues: true });

        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: item,
        });

        try {
            await this.client.send(command);
            this.logger.info(`Successfully saved policy: ${policy.id} version ${policy.version}`);
        } catch (error: any) {
            this.logger.error(`Error saving policy ${policy.id}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to save policy: ${error.message}`);
        }
    }

    async findById(policyId: string): Promise<Policy | null> {
        this.logger.info(`Getting policy by ID: ${policyId}`);
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `POLICY#${policyId}`,
                SK: `POLICY#${policyId}`,
            }),
        });

        try {
            const result = await this.client.send(command) as GetItemCommandOutput;
            if (!result.Item) {
                return null;
            }
            return this.mapToPolicy(result.Item);
        } catch (error: any) {
            this.logger.error(`Error getting policy ${policyId}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to get policy: ${error.message}`);
        }
    }

    async findByName(policyName: string): Promise<Policy | null> {
        this.logger.info(`Getting policy by name: ${policyName}`);
        const commandInput = {
            TableName: this.tableName,
            IndexName: "PolicyNameGSI", // Assuming this GSI exists
            KeyConditionExpression: "PolicyNameGSI_PK = :policyName",
            ExpressionAttributeValues: marshall({
                ":policyName": policyName
            }),
            Limit: 1,
        };
        const command = new QueryCommand(commandInput);

        try {
            const result = await this.client.send(command) as QueryCommandOutput;
            if (!result.Items || result.Items.length === 0) {
                return null;
            }
            return this.mapToPolicy(result.Items[0]);
        } catch (error: any) {
            this.logger.error(`Error getting policy by name ${policyName}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to get policy by name: ${error.message}`);
        }
    }

    async list(options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>> {
        this.logger.info(`Listing policies with options: ${JSON.stringify(options)}`);
        let commandInput: any;
        let command: any;

        if (options?.language) {
            // If filtering by language, use Scan with FilterExpression for now
            // A dedicated GSI for policyLanguage would be more efficient for large datasets
            commandInput = {
                TableName: this.tableName,
                FilterExpression: "EntityType = :type AND policyLanguage = :language",
                ExpressionAttributeValues: marshall({
                    ":type": "Policy",
                    ":language": options.language
                }),
                Limit: options?.limit,
                ExclusiveStartKey: options?.startKey ? marshall(options.startKey) : undefined,
            };
            command = new ScanCommand(commandInput);
        } else {
            // Otherwise, use Query on EntityTypeGSI
            commandInput = {
                TableName: this.tableName,
                IndexName: "EntityTypeGSI",
                KeyConditionExpression: "EntityTypeGSI_PK = :type",
                ExpressionAttributeValues: marshall({
                    ":type": "Policy"
                }),
                Limit: options?.limit,
                ExclusiveStartKey: options?.startKey ? marshall(options.startKey) : undefined,
            };
            command = new QueryCommand(commandInput);
        }

        try {
            const result = await this.client.send(command) as QueryCommandOutput | ScanCommandOutput;
            const policies = result.Items ? result.Items.map((item: Record<string, AttributeValue>) => this.mapToPolicy(item)) : [];
            const lastEvaluatedKey = result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined;
            return { items: policies, lastEvaluatedKey: lastEvaluatedKey };
        } catch (error: any) {
            this.logger.error(`Error listing policies: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policies: ${error.message}`);
        }
    }

    async delete(policyId: string): Promise<boolean> {
        this.logger.info(`Deleting policy with ID: ${policyId}`);
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `POLICY#${policyId}`,
                SK: `POLICY#${policyId}`,
            }),
            ConditionExpression: 'attribute_exists(PK)' // Ensure the item exists before deleting
        });

        try {
            await this.client.send(command);
            this.logger.info(`Successfully deleted policy with ID: ${policyId}`);
            return true;
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete policy, not found: ${policyId}`);
                return false;
            }
            this.logger.error(`Error deleting policy ${policyId}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete policy: ${error.message}`);
        }
    }

    async getPolicyVersion(policyId: string, version: number): Promise<Policy | null> {
        // TODO: Implement this using a GSI on policyId and version for performance.
        this.logger.warn(`Getting policy version using Query on main table. Implement GSI for performance.`);

        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `POLICY#${policyId}`,
                SK: `POLICY#${policyId}` // Assuming SK is also POLICY#id for now
            })
        });

        try {
            const result = await this.client.send(command) as GetItemCommandOutput;
            if (!result.Item) {
                return null;
            }
            const policy = this.mapToPolicy(result.Item);
            // Filter by version in application code for now, if SK is not versioned
            if (policy.version === version) {
                return policy;
            }
            return null;
        } catch (error: any) {
            this.logger.error(`Error finding policy version ${version} for policy ID ${policyId} using GetItem`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy version: ${error.message}`);
        }
    }

    async listPolicyVersions(policyId: string): Promise<Policy[]> {
        // TODO: Implement this using a GSI on policyId for performance.
        this.logger.warn(`Listing policy versions using Query on main table. Implement GSI for performance.`);

        const commandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: marshall({
                ":pk": `POLICY#${policyId}`
            }),
        };
        const command = new QueryCommand(commandInput);

        try {
            const result = await this.client.send(command) as QueryCommandOutput;
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map((item: Record<string, AttributeValue>) => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error(`Error listing policy versions for policy ID ${policyId} using Query`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policy versions: ${error.message}`);
        }
    }

    

    async getAllPolicies(): Promise<Policy[]> {
        this.logger.info('Fetching all policies from DynamoDB using EntityTypeGSI.');
        const commandInput = {
            TableName: this.tableName,
            IndexName: "EntityTypeGSI",
            KeyConditionExpression: "EntityTypeGSI_PK = :type",
            ExpressionAttributeValues: marshall({
                ":type": "Policy"
            }),
        };
        const command = new QueryCommand(commandInput);

        try {
            const result = await this.client.send(command) as QueryCommandOutput;
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map((item: Record<string, AttributeValue>) => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error('Error fetching all policies from DynamoDB', error);
            throw new BaseError('DatabaseError', 500, `Failed to fetch all policies: ${error.message}`);
        }
    }
}