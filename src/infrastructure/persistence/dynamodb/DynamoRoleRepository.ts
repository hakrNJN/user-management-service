import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from "tsyringe";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { IRoleRepository } from "../../../application/interfaces/IRoleRepository";
import { QueryOptions, QueryResult } from "../../../application/interfaces/IUserProfileRepository"; // Reuse pagination types
import { Role } from "../../../domain/entities/Role";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client"; // Inject provider

// Define an interface for the expected structure from DynamoDB
interface RoleDynamoItem {
    PK: string;
    SK: string;
    EntityType: 'Role';
    roleName: string; // This is the key field stored in the item
    description?: string;
    createdAt: string; // Stored as ISO string
    updatedAt: string; // Stored as ISO string
    // Include any other fields you store for Role items
}

@injectable()
export class DynamoRoleRepository implements IRoleRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBDocumentClient;

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        // Assuming a single table name for all authorization entities
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        this.client = DynamoDBDocumentClient.from(dynamoDBProvider.client, {
            marshallOptions: { removeUndefinedValues: true }
        });
    }

    private mapToRole(item: Record<string, any>): Role {
        // 1. Assert the item to the expected DynamoDB structure
        const dynamoItem = item as RoleDynamoItem;

        // 2. Runtime check for the critical required field
        if (typeof dynamoItem.roleName !== 'string' || !dynamoItem.roleName) {
            this.logger.error('Invalid Role item structure retrieved from DynamoDB: missing or invalid roleName', { item: dynamoItem });
            // Throw an error because we cannot create a valid Role entity without its name
            throw new BaseError('InvalidDataError', 500, 'Invalid role data retrieved from database.', false);
        }

        // 3. Pass the validated data (or the asserted object) to the factory method
        return Role.fromPersistence(dynamoItem);
    }

    private createKey(roleName: string) {
        return { PK: `ROLE#${roleName}`, SK: `ROLE#${roleName}` };
    }

    async create(role: Role): Promise<void> {
        const item = {
            ...this.createKey(role.roleName),
            EntityType: 'Role',
            ...role.toPersistence(),
        };
        const command = new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role created successfully: ${role.roleName}`);
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to create role, already exists: ${role.roleName}`);
                throw new BaseError('RoleExistsError', 409, `Role '${role.roleName}' already exists.`);
            }
            this.logger.error(`Error creating role ${role.roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to create role: ${error.message}`);
        }
    }

    async findByName(roleName: string): Promise<Role | null> {
        const command = new GetCommand({
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

    async list(options?: QueryOptions): Promise<QueryResult<Role>> {
        this.logger.warn("Listing roles using Scan operation. Consider using a GSI for performance.");
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type",
            ExpressionAttributeValues: { ":type": "Role" },
            Limit: options?.limit,
            ExclusiveStartKey: options?.startKey,
        };
        const command = new ScanCommand(commandInput);
        try {
            const result = await this.client.send(command);
            const roles: Role[] = []; // Initialize empty array

            // REMOVED the incorrect .map call

            // Process items ONLY within the loop
            if (result.Items) {
                for (const item of result.Items) {
                    try {
                        roles.push(this.mapToRole(item)); // Map and push valid roles
                    } catch (mapError: any) {
                        // Check the error name (more robust)
                        if (mapError instanceof BaseError && mapError.name === 'InvalidDataError') {
                            // Log "Skipping..." - THIS SHOULD BE THE ONLY logger.error CALL IN THIS TEST CASE
                            this.logger.error(`Skipping invalid role item during list operation`, { itemPk: item.PK, error: mapError.message });
                            continue; // Skip this item
                        } else {
                            // Handle unexpected mapping errors
                            this.logger.error(`Unexpected error mapping role during list`, { itemPk: item.PK, error: mapError });
                            throw new BaseError('DatabaseError', 500, `Failed to process role during list: ${mapError.message}`);
                        }
                    }
                }
            }
            // Return correctly populated roles
            return {
                items: roles,
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        } catch (error: any) { // Catches SDK errors or errors re-thrown from the loop's 'else' block
            this.logger.error(`Error listing roles (SDK level or unexpected mapping error)`, error);
            if (error instanceof BaseError) {
                throw error;
            }
            throw new BaseError('DatabaseError', 500, `Failed to list roles: ${error.message}`);
        }
    }

    async update(roleName: string, updates: Partial<Pick<Role, 'description'>>): Promise<Role | null> {
        // Implement DynamoDB UpdateCommand logic similar to UserProfileRepository
        // Ensure to update 'updatedAt'
        this.logger.warn(`Role update not fully implemented yet.`);
        // Placeholder: Fetch, update in memory, save (inefficient but simple example)
        const existing = await this.findByName(roleName);
        if (!existing) return null;
        existing.update(updates);
        await this.create(existing); // Put will overwrite
        return existing;
    }

    async delete(roleName: string): Promise<boolean> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: this.createKey(roleName),
            ConditionExpression: 'attribute_exists(PK)' // Ensure it exists before deleting
        });
        try {
            await this.client.send(command);
            this.logger.info(`Role deleted successfully: ${roleName}`);
            // TODO: Trigger cleanup of assignments via IAssignmentRepository
            return true;
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to delete role, not found: ${roleName}`);
                return false; // Not found
            }
            this.logger.error(`Error deleting role ${roleName}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to delete role: ${error.message}`);
        }
    }
}
