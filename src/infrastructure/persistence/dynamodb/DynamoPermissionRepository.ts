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
import { IPermissionRepository } from "../../../application/interfaces/IPermissionRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { Permission } from "../../../domain/entities/Permission";
import { PermissionExistsError } from "../../../domain/exceptions/UserManagementError"; // Import specific errors
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

// Define an interface for the expected structure from DynamoDB
interface PermissionDynamoItem {
    PK: string;         // PERM#{permissionName}
    SK: string;         // PERM#{permissionName}
    EntityType: 'Permission';
    permissionName: string; // This is the key field stored in the item
    description?: string;
    createdAt: string; // Stored as ISO string
    updatedAt: string; // Stored as ISO string
    // GSI Keys for listing by type
    EntityTypeGSI_PK: string; // Value: 'Permission'
    EntityTypeGSI_SK: string; // Value: PERM#{permissionName}
}

// Constants for GSI
const ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI'; // <<< Define GSI Name

@injectable()
export class DynamoPermissionRepository implements IPermissionRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient; // Use base client

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME'); // Use same table name
        this.client = dynamoDBProvider.client;
    }

    private mapToPermission(item: Record<string, AttributeValue>): Permission {
        const plainObject = unmarshall(item);
        try {
            return Permission.fromPersistence(plainObject as any);
        } catch (error: any) {
            this.logger.error("Failed to map DynamoDB item to Permission entity", { itemPK: item.PK?.S, error: error.message, item });
            throw new BaseError('InvalidDataError', 500, `Invalid permission data retrieved from database: ${error.message}`, false);
        }
    }

    private createKey(permissionName: string): Record<string, AttributeValue> {
        const key = `PERM#${permissionName}`;
        return marshall({ PK: key, SK: key });
    }

    async create(permission: Permission): Promise<void> {
        const item = {
            PK: `PERM#${permission.permissionName}`,
            SK: `PERM#${permission.permissionName}`,
            EntityType: 'Permission',
            ...permission.toPersistence(),
            // Add GSI keys
            EntityTypeGSI_PK: 'Permission',
            EntityTypeGSI_SK: `PERM#${permission.permissionName}`,
        };
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing permission
        });
        try {
            await this.client.send(command);
            this.logger.info(`Permission created successfully: ${permission.permissionName}`);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to create permission, already exists: ${permission.permissionName}`);
                throw new PermissionExistsError(permission.permissionName); // Throw specific error
            }
            this.logger.error(`Error creating permission ${permission.permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to create permission: ${error.message}`);
        }
    }

    async findByName(permissionName: string): Promise<Permission | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: this.createKey(permissionName)
        });
        try {
            const result = await this.client.send(command);
            if (!result.Item) return null;
            return this.mapToPermission(result.Item);
        } catch (error: any) {
            this.logger.error(`Error finding permission ${permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find permission: ${error.message}`);
        }
    }

    // *** MODIFIED list METHOD ***
    async list(options?: QueryOptions): Promise<QueryResult<Permission>> {
        this.logger.debug("Listing permissions using Query on GSI", { options });
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            IndexName: ENTITY_TYPE_GSI_NAME, // <<< Query the GSI
            KeyConditionExpression: "EntityTypeGSI_PK = :type", // <<< Query GSI PK
            ExpressionAttributeValues: marshall({
                 ":type": "Permission"
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey, // Pass opaque key directly
            ScanIndexForward: true, // Default, optional (sorts by GSI SK - which is PK here)
        };
        const command = new QueryCommand(commandInput); // <<< Use QueryCommand
        try {
            const result = await this.client.send(command);
            const permissions = result.Items?.map(item => this.mapToPermission(item)) || [];
            return {
                items: permissions,
                lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey as Record<string, any> : undefined,
            };
        } catch (error: any) {
            this.logger.error(`Error listing permissions via GSI`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list permissions: ${error.message}`);
        }
    }

    // *** MODIFIED update METHOD ***
    async update(permissionName: string, updates: Partial<Pick<Permission, 'description'>>): Promise<Permission | null> {
        const key = this.createKey(permissionName);
        const now = new Date().toISOString();

        // Construct UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues
        const updateExpressionParts: string[] = ['SET updatedAt = :now'];
        const expressionAttributeNames: Record<string, string> = {}; // Use if attribute names conflict with reserved words
        const expressionAttributeValues: Record<string, any> = { ':now': now };

        // Only add updates for fields actually provided
        if (updates.description !== undefined) {
            updateExpressionParts.push('description = :desc');
            expressionAttributeValues[':desc'] = updates.description;
        } else {
             // If explicitly set to undefined or null in DTO, you might want to REMOVE the attribute
             // updateExpressionParts.push('REMOVE description');
             // This requires careful handling based on DTO definition (using null vs undefined)
        }
        // Add other updatable fields here

        const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: key,
            UpdateExpression: updateExpressionParts.join(', '),
            // ExpressionAttributeNames: expressionAttributeNames, // Include if needed
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ConditionExpression: 'attribute_exists(PK)', // Ensure the item exists
            ReturnValues: 'ALL_NEW', // Return the updated item
        });

        try {
            const result = await this.client.send(command);
            if (!result.Attributes) {
                 // Should not happen if ReturnValues is ALL_NEW and condition passes, but check anyway
                 this.logger.error("UpdateItem succeeded but returned no attributes", { permissionName });
                 throw new BaseError('DatabaseError', 500, 'Failed to retrieve updated permission attributes.');
            }
            this.logger.info(`Permission updated successfully: ${permissionName}`);
            return this.mapToPermission(result.Attributes); // Map the returned updated item
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                 this.logger.warn(`Failed to update permission, not found: ${permissionName}`);
                 return null; // Return null if the item didn't exist
            }
            this.logger.error(`Error updating permission ${permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to update permission: ${error.message}`);
        }
    }


    async delete(permissionName: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: this.createKey(permissionName),
            ConditionExpression: 'attribute_exists(PK)'
        });
        try {
            await this.client.send(command);
            this.logger.info(`Permission deleted successfully: ${permissionName}`);
            // Note: Cleanup of assignments should be handled by the service layer calling the AssignmentRepository
            return true;
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete permission, not found: ${permissionName}`);
                return false;
            }
            this.logger.error(`Error deleting permission ${permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete permission: ${error.message}`);
        }
    }
}