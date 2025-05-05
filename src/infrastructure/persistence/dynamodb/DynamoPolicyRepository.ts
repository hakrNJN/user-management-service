import {
    AttributeValue,
    ConditionalCheckFailedException,
    DeleteItemCommand,
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    ScanCommand,
    ScanCommandInput
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { IPolicyRepository } from "../../../application/interfaces/IPolicyRepository";
import { QueryOptions, QueryResult } from "../../../application/interfaces/IUserProfileRepository";
import { Policy } from "../../../domain/entities/Policy";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client"; // Import provider

// Define an interface for the raw DynamoDB item structure for clarity
interface PolicyDynamoItem {
    PK: string; // Primary Key: POLICY#{policyId}
    SK: string; // Sort Key: POLICY#{policyId}
    EntityType: 'Policy';
    id: string; // Stored explicitly for easier retrieval
    policyName: string;
    policyDefinition: string;
    policyLanguage: string;
    description?: string;
    version?: string;
    metadata?: Record<string, any>; // Store as DynamoDB Map
    createdAt: string; // ISO String
    updatedAt: string; // ISO String
    // Add GSI keys if/when implemented (e.g., GSI1PK: POLICY_NAME#{policyName})
    // GSI1PK?: string;
    // GSI1SK?: string;
}

@injectable()
export class DynamoPolicyRepository implements IPolicyRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient; // Use base client for marshall/unmarshall clarity

    // TODO: Define GSI name constant if implementing findByName with GSI
    // private readonly GSI1_NAME = 'GSI1'; // Example

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME'); // Assuming policies share the table
        this.client = dynamoDBProvider.client;
    }

    private mapToPolicy(item: Record<string, AttributeValue>): Policy {
        const plainObject = unmarshall(item);
        try {
            // Use the entity's factory method for validation and instantiation
            return Policy.fromPersistence(plainObject as any);
        } catch (error: any) {
            this.logger.error("Failed to map DynamoDB item to Policy entity", { itemPK: item.PK?.S, error: error.message, item });
            // Re-throw a more specific error if needed, or let the original bubble up
            throw new BaseError('InvalidDataError', 500, `Invalid policy data retrieved from database: ${error.message}`, false);
        }
    }

    private createKey(policyId: string): Record<string, AttributeValue> {
        return marshall({ PK: `POLICY#${policyId}`, SK: `POLICY#${policyId}` });
    }

    async save(policy: Policy): Promise<void> {
        const dynamoItem: PolicyDynamoItem = {
            PK: `POLICY#${policy.id}`,
            SK: `POLICY#${policy.id}`,
            EntityType: 'Policy',
            ...policy.toPersistence(), // Spread the plain object from the entity
            // Add GSI keys here if using GSI for findByName
            // GSI1PK: `POLICY_NAME#${policy.policyName}`,
            // GSI1SK: `POLICY#${policy.id}`,
        };

        // Use PutItem - this handles both create and update (overwrites)
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(dynamoItem, { removeUndefinedValues: true }),
            // Optional: Add ConditionExpression for optimistic locking using version field if needed
        });

        try {
            await this.client.send(command);
            this.logger.info(`Policy saved/updated successfully: ${policy.policyName} (ID: ${policy.id})`);
        } catch (error: any) {
            // Note: PutItem doesn't throw ConditionalCheckFailedException unless you add a condition.
            // Uniqueness constraint (e.g., on policyName) needs to be handled either by the service layer
            // before calling save, or by using a GSI with a transaction/conditional put on the GSI key.
            this.logger.error(`Error saving policy ${policy.policyName} (ID: ${policy.id})`, error);
            throw new BaseError('DatabaseError', 500, `Failed to save policy: ${error.message}`);
        }
    }

    async findById(policyId: string): Promise<Policy | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: this.createKey(policyId),
        });
        try {
            const result = await this.client.send(command);
            if (!result.Item) {
                return null;
            }
            return this.mapToPolicy(result.Item);
        } catch (error: any) {
            this.logger.error(`Error finding policy by ID ${policyId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy by ID: ${error.message}`);
        }
    }

    async findByName(policyName: string): Promise<Policy | null> {
        // TODO: Implement this using a GSI on policyName for performance.
        this.logger.warn(`Finding policy by name using Scan. Implement GSI for performance.`);

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND policyName = :name",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":name": policyName
            }),
            Limit: 1 // We only expect one policy with a unique name
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return null;
            }
            if (result.Items.length > 1) {
                // This indicates a data integrity issue if policyName should be unique
                this.logger.error(`Inconsistency: Found multiple policies with the name ${policyName}. Returning the first one.`);
            }
            return this.mapToPolicy(result.Items[0]);
        } catch (error: any) {
            this.logger.error(`Error finding policy by name ${policyName} using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy by name: ${error.message}`);
        }
    }

    async list(options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>> {
        this.logger.warn("Listing policies using Scan operation. Consider using a GSI for performance, especially with filters.");

        const filterExpressions: string[] = ["EntityType = :type"];
        const expressionAttributeValues: Record<string, any> = { ":type": "Policy" };

        if (options?.language) {
            filterExpressions.push("policyLanguage = :lang");
            expressionAttributeValues[":lang"] = options.language;
        }

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: filterExpressions.join(" AND "),
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey, // Pass opaque start key directly
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            const policies = result.Items?.map(item => this.mapToPolicy(item)) || [];
            return {
                items: policies,
                // Return LastEvaluatedKey directly, service/controller layer shouldn't need to know its structure
                lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey as Record<string, any> : undefined,
            };
        } catch (error: any) {
            this.logger.error(`Error listing policies using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policies: ${error.message}`);
        }
    }

    async delete(policyId: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: this.createKey(policyId),
            ConditionExpression: 'attribute_exists(PK)' // Ensure item exists before deleting
        });
        try {
            await this.client.send(command);
            this.logger.info(`Policy deleted successfully: ID ${policyId}`);
            return true;
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete policy ID ${policyId}, not found.`);
                return false; // Not found
            }
            this.logger.error(`Error deleting policy ID ${policyId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete policy: ${error.message}`);
        }
    }
}