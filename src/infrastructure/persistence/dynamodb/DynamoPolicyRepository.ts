import { DynamoDBClient, ScanCommandInput, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, QueryCommandOutput, GetItemCommandOutput, PutItemCommandOutput, DeleteItemCommandOutput, AttributeValue } from "@aws-sdk/client-dynamodb";
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

    private getPK(tenantId: string): string {
        return `TENANT#${tenantId}`;
    }

    private getPolicySK(policyId: string): string {
        return `POLICY#${policyId}`;
    }

    private mapToPolicy(item: Record<string, any>): Policy {
        const unmarshalled = unmarshall(item);
        return new Policy(
            unmarshalled.tenantId,
            unmarshalled.id,
            unmarshalled.policyName,
            unmarshalled.policyDefinition,
            unmarshalled.policyLanguage,
            unmarshalled.version,
            unmarshalled.description,
            unmarshalled.metadata,
            new Date(unmarshalled.createdAt),
            new Date(unmarshalled.updatedAt),
            unmarshalled.isActive
        );
    }

    async save(policy: Policy): Promise<void> {
        this.logger.info(`Saving policy: ${policy.id} version ${policy.version} for tenant ${policy.tenantId}`);
        const item = marshall({
            PK: this.getPK(policy.tenantId),
            SK: this.getPolicySK(policy.id),
            EntityType: "Policy",
            tenantId: policy.tenantId,
            id: policy.id,
            policyName: policy.policyName,
            policyDefinition: policy.policyDefinition,
            policyLanguage: policy.policyLanguage,
            version: policy.version,
            description: policy.description,
            metadata: policy.metadata,
            createdAt: policy.createdAt.toISOString(),
            updatedAt: policy.updatedAt.toISOString(),
            isActive: policy.isActive,
            // GSI attributes
            EntityTypeGSI_PK: this.getPK(policy.tenantId), // Partition by tenant
            EntityTypeGSI_SK: this.getPolicySK(policy.id),
            PolicyNameGSI_PK: this.getPK(policy.tenantId), // Partition by tenant
            PolicyNameGSI_SK: `POLICYNAME#${policy.policyName}`,
        }, { removeUndefinedValues: true });

        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: item,
        });

        try {
            await this.client.send(command);
            this.logger.info(`Successfully saved policy: ${policy.id} version ${policy.version} for tenant ${policy.tenantId}`);
        } catch (error: any) {
            this.logger.error(`Error saving policy ${policy.id}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to save policy: ${error.message}`);
        }
    }

    async findById(tenantId: string, policyId: string): Promise<Policy | null> {
        this.logger.info(`Getting policy by ID: ${policyId} for tenant ${tenantId}`);
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: this.getPK(tenantId),
                SK: this.getPolicySK(policyId),
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

    async findByName(tenantId: string, policyName: string): Promise<Policy | null> {
        this.logger.info(`Getting policy by name: ${policyName} for tenant ${tenantId}`);
        const commandInput = {
            TableName: this.tableName,
            IndexName: "PolicyNameGSI",
            KeyConditionExpression: "PolicyNameGSI_PK = :pk AND PolicyNameGSI_SK = :sk",
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":sk": `POLICYNAME#${policyName}`
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

    async list(tenantId: string, options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>> {
        this.logger.info(`Listing policies for tenant ${tenantId} with options: ${JSON.stringify(options)}`);

        // Use Query on main table (or EntityTypeGSI) to get all policies for a tenant
        const commandInput: any = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":skPrefix": "POLICY#"
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey ? marshall(options.startKey) : undefined,
        };

        const command = new QueryCommand(commandInput);

        try {
            const result = await this.client.send(command) as QueryCommandOutput;
            let policies = result.Items ? result.Items.map((item: Record<string, AttributeValue>) => this.mapToPolicy(item)) : [];

            if (options?.language) {
                policies = policies.filter(p => p.policyLanguage === options.language);
            }

            const lastEvaluatedKey = result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined;
            return { items: policies, lastEvaluatedKey: lastEvaluatedKey };
        } catch (error: any) {
            this.logger.error(`Error listing policies: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policies: ${error.message}`);
        }
    }

    async delete(tenantId: string, policyId: string): Promise<boolean> {
        this.logger.info(`Deleting policy with ID: ${policyId} for tenant ${tenantId}`);
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: this.getPK(tenantId),
                SK: this.getPolicySK(policyId),
            }),
            ConditionExpression: 'attribute_exists(PK)'
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

    async getPolicyVersion(tenantId: string, policyId: string, version: number): Promise<Policy | null> {
        this.logger.warn(`Getting policy version using Query on main table.`);

        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: this.getPK(tenantId),
                SK: this.getPolicySK(policyId) // Assuming SK is also POLICY#id for now, versioning needs deeper modeling
            })
        });

        try {
            const result = await this.client.send(command) as GetItemCommandOutput;
            if (!result.Item) {
                return null;
            }
            const policy = this.mapToPolicy(result.Item);
            if (policy.version === version) {
                return policy;
            }
            return null;
        } catch (error: any) {
            this.logger.error(`Error finding policy version ${version} for policy ID ${policyId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy version: ${error.message}`);
        }
    }

    async listPolicyVersions(tenantId: string, policyId: string): Promise<Policy[]> {
        this.logger.warn(`Listing policy versions using Query on main table.`);

        const commandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND SK = :sk", // If versioned, SK would be POLICY#<id>#v<version>
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":sk": this.getPolicySK(policyId)
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
            this.logger.error(`Error listing policy versions for policy ID ${policyId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policy versions: ${error.message}`);
        }
    }

    async getAllPolicies(tenantId: string): Promise<Policy[]> {
        this.logger.info(`Fetching all policies from DynamoDB for tenant ${tenantId}.`);
        const commandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":skPrefix": "POLICY#"
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
            this.logger.error(`Error fetching all policies for tenant ${tenantId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to fetch all policies: ${error.message}`);
        }
    }
}