import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, ScanCommand, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from "tsyringe";
import { IPermissionRepository } from "../../../application/interfaces/IPermissionRepository";
import { QueryOptions, QueryResult } from "../../../application/interfaces/IUserProfileRepository";
import { Permission } from "../../../domain/entities/Permission";
import { TYPES } from "../../../shared/constants/types";
import { ILogger } from "../../../application/interfaces/ILogger";
import { DynamoDBProvider } from "./dynamodb.client";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { BaseError, NotFoundError } from "../../../shared/errors/BaseError";

@injectable()
export class DynamoPermissionRepository implements IPermissionRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBDocumentClient;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME'); // Use same table name
        this.client = DynamoDBDocumentClient.from(dynamoDBProvider.client, {
             marshallOptions: { removeUndefinedValues: true }
        });
    }

     private mapToPermission(item: Record<string, any>): Permission {
        return Permission.fromPersistence(item);
    }

    private createKey(permissionName: string) {
        return { PK: `PERM#${permissionName}`, SK: `PERM#${permissionName}` };
    }

    async create(permission: Permission): Promise<void> {
        const item = {
            ...this.createKey(permission.permissionName),
            EntityType: 'Permission',
            ...permission.toPersistence(),
        };
        const command = new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)'
        });
         try {
            await this.client.send(command);
            this.logger.info(`Permission created successfully: ${permission.permissionName}`);
        } catch (error: any) {
             if (error.name === 'ConditionalCheckFailedException') {
                 this.logger.warn(`Failed to create permission, already exists: ${permission.permissionName}`);
                 throw new BaseError('PermissionExistsError', 409, `Permission '${permission.permissionName}' already exists.`);
             }
             this.logger.error(`Error creating permission ${permission.permissionName}`, error);
             throw new BaseError('DatabaseError', 500, `Failed to create permission: ${error.message}`);
        }
    }

    async findByName(permissionName: string): Promise<Permission | null> {
        const command = new GetCommand({
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

    async list(options?: QueryOptions): Promise<QueryResult<Permission>> {
        this.logger.warn("Listing permissions using Scan operation. Consider using a GSI for performance.");
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type",
            ExpressionAttributeValues: { ":type": "Permission" },
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey,
        };
        const command = new ScanCommand(commandInput);
         try {
            const result = await this.client.send(command);
            const permissions = result.Items?.map(item => this.mapToPermission(item)) || [];
            return {
                items: permissions,
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        } catch (error: any) {
             this.logger.error(`Error listing permissions`, error);
             throw new BaseError('DatabaseError', 500, `Failed to list permissions: ${error.message}`);
        }
    }

    async update(permissionName: string, updates: Partial<Pick<Permission, 'description'>>): Promise<Permission | null> {
        // Implement DynamoDB UpdateCommand logic
        this.logger.warn(`Permission update not fully implemented yet.`);
        // Placeholder: Fetch, update in memory, save
        const existing = await this.findByName(permissionName);
        if (!existing) return null;
        existing.update(updates);
        await this.create(existing); // Put will overwrite
        return existing;
    }

    async delete(permissionName: string): Promise<boolean> {
         const command = new DeleteCommand({
            TableName: this.tableName,
            Key: this.createKey(permissionName),
            ConditionExpression: 'attribute_exists(PK)'
        });
         try {
            await this.client.send(command);
            this.logger.info(`Permission deleted successfully: ${permissionName}`);
             // TODO: Trigger cleanup of assignments via IAssignmentRepository
            return true;
        } catch (error: any) {
             if (error.name === 'ConditionalCheckFailedException') {
                 this.logger.warn(`Failed to delete permission, not found: ${permissionName}`);
                 return false;
             }
             this.logger.error(`Error deleting permission ${permissionName}`, error);
             throw new BaseError('DatabaseError', 500, `Failed to delete permission: ${error.message}`);
        }
    }
}
