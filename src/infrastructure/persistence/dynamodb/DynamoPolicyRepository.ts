import { DynamoDBClient, ScanCommand, ScanCommandInput, GetItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { Policy } from "../../../domain/entities/Policy";
import { IPolicyRepository } from "../../../application/interfaces/IPolicyRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { ILogger } from "../../../application/interfaces/ILogger";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

@injectable()
export class DynamoPolicyRepository implements IPolicyRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient;

    constructor(
        @inject(TYPES.DynamoDBProvider) private dynamoDBProvider: DynamoDBProvider,
        @inject(TYPES.Logger) private logger: ILogger
    ) {
        // This should ideally come from a config service
        this.tableName = process.env.DYNAMODB_TABLE_NAME || "UserManagementTable";
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
        });

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
        this.logger.info(`Getting latest policy for ID: ${policyId}`);
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND id = :id",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":id": policyId
            }),
            Limit: 1, // Assuming we want the latest, and scan returns by default in some order or we need to sort
            // For a true "latest" policy, a GSI with version as sort key would be ideal.
            // For now, we'll just get one and assume it's the latest or handle sorting if multiple are returned.
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return null;
            }
            // If multiple versions exist, this would return the first one found by scan.
            // A more robust solution would involve a GSI or a query with a sort key.
            return this.mapToPolicy(result.Items[0]);
        } catch (error: any) {
            this.logger.error(`Error getting policy ${policyId}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to get policy: ${error.message}`);
        }
    }

    async findByName(policyName: string): Promise<Policy | null> {
        this.logger.info(`Getting policy by name: ${policyName}`);
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND policyName = :policyName",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":policyName": policyName
            }),
            Limit: 1,
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
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
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type" + (options?.language ? " AND policyLanguage = :language" : ""),
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ...(options?.language && { ":language": options.language })
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey ? marshall(options.startKey) : undefined,
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            const policies = result.Items ? result.Items.map(item => this.mapToPolicy(item)) : [];
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
                EntityType: "Policy",
                id: policyId,
            }),
        });

        try {
            await this.client.send(command);
            this.logger.info(`Successfully deleted policy with ID: ${policyId}`);
            return true;
        } catch (error: any) {
            this.logger.error(`Error deleting policy ${policyId}: ${error.message}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete policy: ${error.message}`);
        }
    }

    async getPolicyVersion(policyId: string, version: number): Promise<Policy | null> {
        // TODO: Implement this using a GSI on policyId and version for performance.
        this.logger.warn(`Getting policy version using Scan. Implement GSI for performance.`);

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND id = :id AND version = :version",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":id": policyId,
                ":version": version
            }),
            Limit: 1
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return null;
            }
            return this.mapToPolicy(result.Items[0]);
        } catch (error: any) {
            this.logger.error(`Error finding policy version ${version} for policy ID ${policyId} using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy version: ${error.message}`);
        }
    }

    async listPolicyVersions(policyId: string): Promise<Policy[]> {
        // TODO: Implement this using a GSI on policyId for performance.
        this.logger.warn(`Listing policy versions using Scan. Implement GSI for performance.`);

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND id = :id",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":id": policyId
            }),
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map(item => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error(`Error listing policy versions for policy ID ${policyId} using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policy versions: ${error.message}`);
        }
    }

    async getAllPolicies(): Promise<Policy[]> {
        this.logger.info('Fetching all policies from DynamoDB.');
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type",
            ExpressionAttributeValues: marshall({
                ":type": "Policy"
            }),
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map(item => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error('Error fetching all policies from DynamoDB', error);
            throw new BaseError('DatabaseError', 500, `Failed to fetch all policies: ${error.message}`);
        }
    }
}