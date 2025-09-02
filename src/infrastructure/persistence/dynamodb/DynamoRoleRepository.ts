import {
    AttributeValue,
    ConditionalCheckFailedException, DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand,
    QueryCommand, // <<< Import QueryCommand
    QueryCommandInput, // <<< Import QueryCommandInput
    UpdateItemCommand // <<< Import UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { IRoleRepository } from "../../../application/interfaces/IRoleRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { Role } from "../../../domain/entities/Role";
import { RoleExistsError } from "../../../domain/exceptions/UserManagementError"; // Import specific errors
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client"; // Inject provider

// Define an interface for the expected structure from DynamoDB
interface RoleDynamoItem {
    PK: string;         // ROLE#{roleName}
    SK: string;         // ROLE#{roleName}
    EntityType: 'Role';
    roleName: string;   // This is the key field stored in the item
    description?: string;
    createdAt: string; // Stored as ISO string
    updatedAt: string; // Stored as ISO string
    // GSI Keys for listing by type
    EntityTypeGSI_PK: string; // Value: 'Role'
    EntityTypeGSI_SK: string; // Value: ROLE#{roleName}
}

// Constants for GSI
export const ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI'; // <<< Define GSI Name

@injectable()
export class DynamoRoleRepository implements IRoleRepository {
    private readonly tableName: string;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBClient) private client: DynamoDBClient
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
    }

    private mapToRole(item: Record<string, AttributeValue>): Role {
        const plainObject = unmarshall(item);
         try {
             return Role.fromPersistence(plainObject as any);
        } catch (error: any) {
            this.logger.error("Failed to map DynamoDB item to Role entity", { itemPK: item.PK?.S, error: error.message, item });
            throw new BaseError('InvalidDataError', 500, `Invalid role data retrieved from database: ${error.message}`, false);
        }
    }

    private createKey(roleName: string): Record<string, AttributeValue> {
         const key = `ROLE#${roleName}`;
         return marshall({ PK: key, SK: key });
    }

    async create(role: Role): Promise<void> {
        const item = {
            PK: `ROLE#${role.roleName}`,
            SK: `ROLE#${role.roleName}`,
            EntityType: 'Role',
            ...role.toPersistence(),
            // Add GSI keys
            EntityTypeGSI_PK: 'Role',
            EntityTypeGSI_SK: `ROLE#${role.roleName}`,
        };
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role created successfully: ${role.roleName}`);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to create role, already exists: ${role.roleName}`);
                throw new RoleExistsError(role.roleName); // Throw specific error
            }
            this.logger.error(`Error creating role ${role.roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to create role: ${error.message}`);
        }
    }

    async findByName(roleName: string): Promise<Role | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: this.createKey(roleName)
        });
        try {
            const result = await this.client.send(command);
            if (!result.Item) return null;
            return this.mapToRole(result.Item);
        } catch (error: any) {
            this.logger.error(`Error finding role ${roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find role: ${error.message}`);
        }
    }

    // *** MODIFIED list METHOD ***
    async list(options?: QueryOptions): Promise<QueryResult<Role>> {
        this.logger.debug("Listing roles using Query on GSI", { options });
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            IndexName: ENTITY_TYPE_GSI_NAME, // <<< Query the GSI
            KeyConditionExpression: "EntityTypeGSI_PK = :type", // <<< Query GSI PK
            ExpressionAttributeValues: marshall({
                 ":type": "Role"
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey, // Pass opaque key directly
            ScanIndexForward: true,
        };
                const command = new QueryCommand(commandInput); // <<< Use QueryCommand
        try {
            const result = await this.client.send(command);
            const roles = result.Items?.map(item => this.mapToRole(item)) || [];
            return {
                items: roles,
                lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey as Record<string, any> : undefined,
            };
        } catch (error: any) {
            this.logger.error(`Error listing roles via GSI`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list roles: ${error.message}`);
        }
    }

    // *** MODIFIED update METHOD ***
    async update(roleName: string, updates: Partial<Pick<Role, 'description'>>): Promise<Role | null> {
        const key = this.createKey(roleName);
        const now = new Date().toISOString();

        const updateExpressionParts: string[] = ['SET updatedAt = :now'];
        const expressionAttributeValues: Record<string, any> = { ':now': now };

        if (updates.description !== undefined) {
            updateExpressionParts.push('description = :desc');
            expressionAttributeValues[':desc'] = updates.description;
        } // Add handling for other fields if they become updatable

        const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: key,
            UpdateExpression: updateExpressionParts.join(', '),
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ConditionExpression: 'attribute_exists(PK)',
            ReturnValues: 'ALL_NEW',
        });

        try {
            const result = await this.client.send(command);
             if (!result.Attributes) {
                 this.logger.error("UpdateItem succeeded but returned no attributes", { roleName });
                 throw new BaseError('DatabaseError', 500, 'Failed to retrieve updated role attributes.');
            }
            this.logger.info(`Role updated successfully: ${roleName}`);
            return this.mapToRole(result.Attributes);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to update role, not found: ${roleName}`);
                return null;
            }
            this.logger.error(`Error updating role ${roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to update role: ${error.message}`);
        }
    }

    async delete(roleName: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: this.createKey(roleName),
            ConditionExpression: 'attribute_exists(PK)' // Ensure it exists before deleting
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role deleted successfully: ${roleName}`);
            // Service layer handles assignment cleanup
            return true;
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete role, not found: ${roleName}`);
                return false; // Not found
            }
            this.logger.error(`Error deleting role ${roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete role: ${error.message}`);
        }
    }
}