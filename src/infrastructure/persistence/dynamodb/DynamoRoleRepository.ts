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
import { IRoleRepository } from "../../../application/interfaces/IRoleRepository";
import { QueryOptions, QueryResult } from "../../../shared/types/query.types";
import { Role } from "../../../domain/entities/Role";
import { RoleExistsError } from "../../../domain/exceptions/UserManagementError";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

interface RoleDynamoItem {
    PK: string;
    SK: string;
    EntityType: 'Role';
    tenantId: string;
    roleName: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    EntityTypeGSI_PK: string;
    EntityTypeGSI_SK: string;
}

export const ENTITY_TYPE_GSI_NAME = 'EntityTypeGSI';

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

    private getPK(tenantId: string): string {
        return `TENANT#${tenantId}`;
    }

    private getRoleSK(roleName: string): string {
        return `ROLE#${roleName}`;
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

    private createKey(tenantId: string, roleName: string): Record<string, AttributeValue> {
        return marshall({ PK: this.getPK(tenantId), SK: this.getRoleSK(roleName) });
    }

    async create(role: Role): Promise<void> {
        const item: RoleDynamoItem = {
            PK: this.getPK(role.tenantId),
            SK: this.getRoleSK(role.roleName),
            EntityType: 'Role',
            ...role.toPersistence() as any, // Cast from toPersistence output
            EntityTypeGSI_PK: this.getPK(role.tenantId),
            EntityTypeGSI_SK: this.getRoleSK(role.roleName),
        };
        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role created successfully: ${role.roleName} in tenant ${role.tenantId}`);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to create role, already exists: ${role.roleName}`);
                throw new RoleExistsError(role.roleName);
            }
            this.logger.error(`Error creating role ${role.roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to create role: ${error.message}`);
        }
    }

    async findByName(tenantId: string, roleName: string): Promise<Role | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: this.createKey(tenantId, roleName)
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

    async list(tenantId: string, options?: QueryOptions): Promise<QueryResult<Role>> {
        this.logger.debug("Listing roles using Query on main table for tenant", { tenantId, options });
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: marshall({
                ":pk": this.getPK(tenantId),
                ":skPrefix": "ROLE#"
            }),
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey,
            ScanIndexForward: true,
        };
        const command = new QueryCommand(commandInput);
        try {
            const result = await this.client.send(command);
            const roles = result.Items?.map(item => this.mapToRole(item)) || [];
            return {
                items: roles,
                lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey as Record<string, any> : undefined,
            };
        } catch (error: any) {
            this.logger.error(`Error listing roles`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list roles: ${error.message}`);
        }
    }

    async update(tenantId: string, roleName: string, updates: Partial<Pick<Role, 'description'>>): Promise<Role | null> {
        const key = this.createKey(tenantId, roleName);
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

    async delete(tenantId: string, roleName: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: this.createKey(tenantId, roleName),
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role deleted successfully: ${roleName} in tenant ${tenantId}`);
            return true;
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete role, not found: ${roleName} in tenant ${tenantId}`);
                return false;
            }
            this.logger.error(`Error deleting role ${roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete role: ${error.message}`);
        }
    }
}