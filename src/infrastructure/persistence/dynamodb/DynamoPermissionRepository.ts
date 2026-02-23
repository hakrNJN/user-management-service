import {
    AttributeValue,
    ConditionalCheckFailedException, DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand,
    QueryCommand,
    QueryCommandInput,
    UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { IPermissionRepository } from "../../../application/interfaces/IPermissionRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { Permission } from "../../../domain/entities/Permission";
import { PermissionExistsError } from "../../../domain/exceptions/UserManagementError";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

interface PermissionDynamoItem {
    PK: string;
    SK: string;
    EntityType: 'Permission';
    tenantId: string;
    permissionName: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    EntityTypeGSI_PK: string;
    EntityTypeGSI_SK: string;
}

const ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI';

@injectable()
export class DynamoPermissionRepository implements IPermissionRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        this.client = dynamoDBProvider.client;
    }

    private getPK(tenantId: string): string {
        return `TENANT#${tenantId}`;
    }

    private getPermissionSK(permissionName: string): string {
        return `PERM#${permissionName}`;
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

    private createKey(tenantId: string, permissionName: string): Record<string, AttributeValue> {
        return marshall({ PK: this.getPK(tenantId), SK: this.getPermissionSK(permissionName) });
    }

    async create(permission: Permission): Promise<void> {
        const item: PermissionDynamoItem = {
            PK: this.getPK(permission.tenantId),
            SK: this.getPermissionSK(permission.permissionName),
            EntityType: 'Permission',
            ...permission.toPersistence() as any,
            EntityTypeGSI_PK: this.getPK(permission.tenantId),
            EntityTypeGSI_SK: this.getPermissionSK(permission.permissionName),
        };
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        });
        try {
            await this.client.send(command);
            this.logger.info(`Permission created successfully: ${permission.permissionName} in tenant ${permission.tenantId}`);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to create permission, already exists: ${permission.permissionName}`);
                throw new PermissionExistsError(permission.permissionName);
            }
            this.logger.error(`Error creating permission ${permission.permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to create permission: ${error.message}`);
        }
    }

    async findByName(tenantId: string, permissionName: string): Promise<Permission | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: this.createKey(tenantId, permissionName)
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

    async list(tenantId: string, options?: QueryOptions): Promise<QueryResult<Permission>> {
        this.logger.debug("Listing permissions using Query on main table for tenant", { tenantId, options });
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":skPrefix": "PERM#"
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey,
            ScanIndexForward: true,
        };
        const command = new QueryCommand(commandInput);
        try {
            const result = await this.client.send(command);
            const permissions = result.Items?.map(item => this.mapToPermission(item)) || [];
            return {
                items: permissions,
                lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey as Record<string, any> : undefined,
            };
        } catch (error: any) {
            this.logger.error(`Error listing permissions for tenant ${tenantId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list permissions: ${error.message}`);
        }
    }

    async update(tenantId: string, permissionName: string, updates: Partial<Pick<Permission, 'description'>>): Promise<Permission | null> {
        const key = this.createKey(tenantId, permissionName);
        const now = new Date().toISOString();

        const updateExpressionParts: string[] = ['SET updatedAt = :now'];
        const expressionAttributeValues: Record<string, any> = { ':now': now };

        if (updates.description !== undefined) {
            updateExpressionParts.push('description = :desc');
            expressionAttributeValues[':desc'] = updates.description;
        }

        const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: key,
            UpdateExpression: updateExpressionParts.join(', '),
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
            ReturnValues: 'ALL_NEW',
        });

        try {
            const result = await this.client.send(command);
            if (!result.Attributes) {
                this.logger.error("UpdateItem succeeded but returned no attributes", { permissionName });
                throw new BaseError('DatabaseError', 500, 'Failed to retrieve updated permission attributes.');
            }
            this.logger.info(`Permission updated successfully: ${permissionName}`);
            return this.mapToPermission(result.Attributes);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to update permission, not found: ${permissionName}`);
                return null;
            }
            this.logger.error(`Error updating permission ${permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to update permission: ${error.message}`);
        }
    }

    async delete(tenantId: string, permissionName: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: this.createKey(tenantId, permissionName),
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
        });
        try {
            await this.client.send(command);
            this.logger.info(`Permission deleted successfully: ${permissionName} in tenant ${tenantId}`);
            return true;
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete permission, not found: ${permissionName} in tenant ${tenantId}`);
                return false;
            }
            this.logger.error(`Error deleting permission ${permissionName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete permission: ${error.message}`);
        }
    }
}