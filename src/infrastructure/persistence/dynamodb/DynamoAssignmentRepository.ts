import {
    AttributeValue,
    BatchWriteItemCommand,
    BatchWriteItemCommandInput,
    DeleteItemCommand,
    DynamoDBClient,
    PutItemCommand,
    QueryCommand,
    QueryCommandInput,
    WriteRequest
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb"; // <<< Use marshall from util
import { inject, injectable } from "tsyringe";
import { IAssignmentRepository } from "../../../application/interfaces/IAssignmentRepository";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

// Constants for GSIs
const GSI1_NAME = 'GSI1'; // Assumes GSI with SK as PK and PK as SK

@injectable()
export class DynamoAssignmentRepository implements IAssignmentRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBClient; 

    constructor(
        @inject(TYPES.ConfigService) configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(DynamoDBProvider) dynamoDBProvider: DynamoDBProvider
    ) {
        this.tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        this.client = dynamoDBProvider.client; // <<< Get base client from provider
    }

    // --- Generic Helper for Batch Delete ---
    private async batchDeleteItems(itemsToDelete: Array<{ PK: string; SK: string }>): Promise<void> {
        if (!itemsToDelete || itemsToDelete.length === 0) {
            return;
        }

        const BATCH_SIZE = 25; // DynamoDB limit for BatchWriteItem
        for (let i = 0; i < itemsToDelete.length; i += BATCH_SIZE) {
            const batch = itemsToDelete.slice(i, i + BATCH_SIZE);
            const deleteRequests: WriteRequest[] = batch.map(item => ({
                DeleteRequest: {
                    Key: marshall({ PK: item.PK, SK: item.SK })
                }
            }));

            const batchWriteInput: BatchWriteItemCommandInput = {
                RequestItems: {
                    [this.tableName]: deleteRequests
                }
            };
            const command = new BatchWriteItemCommand(batchWriteInput);

            try {
                let result = await this.client.send(command);
                // Handle unprocessed items (optional but recommended for production)
                while (result.UnprocessedItems && result.UnprocessedItems[this.tableName] && result.UnprocessedItems[this.tableName].length > 0) {
                    this.logger.warn(`Retrying ${result.UnprocessedItems[this.tableName].length} unprocessed delete items...`);
                    const retryInput: BatchWriteItemCommandInput = { RequestItems: result.UnprocessedItems };
                    const retryCommand = new BatchWriteItemCommand(retryInput);
                    // Add delay/backoff here if needed
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Simple 1s delay
                    result = await this.client.send(retryCommand);
                }
            } catch (error: any) {
                 this.logger.error(`Error during batch delete operation`, { error });
                 // Decide strategy: continue deleting other batches or throw immediately?
                 // Throwing ensures atomicity isn't partially violated silently.
                 throw new BaseError('DatabaseError', 500, `Failed during batch delete: ${error.message}`);
            }
        }
    }

    // --- Generic Helper for Querying Items ---
    private async queryAllItems(queryInput: QueryCommandInput): Promise<Array<Record<string, any>>> {
        let allItems: Array<Record<string, any>> = [];
        let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

        do {
            queryInput.ExclusiveStartKey = lastEvaluatedKey;
            const command = new QueryCommand(queryInput);
            try {
                const results = await this.client.send(command);
                if (results.Items) {
                    allItems = allItems.concat(results.Items);
                }
                lastEvaluatedKey = results.LastEvaluatedKey;
            } catch (error: any) {
                this.logger.error("Error during paginated query", { queryInput, error });
                throw new BaseError('DatabaseError', 500, `Failed during query: ${error.message}`);
            }
        } while (lastEvaluatedKey);

        return allItems;
    }


    // --- Generic Assignment/Removal (using base client and marshall) ---
    private async assign(pk: string, sk: string, relationshipType: string): Promise<void> {
        const command = new PutItemCommand({ // <<< Use PutItemCommand
            TableName: this.tableName,
            Item: marshall({ // <<< Use marshall
                 PK: pk,
                 SK: sk,
                 EntityType: relationshipType,
                 AssignedAt: new Date().toISOString()
            }, { removeUndefinedValues: true }),
            // Optional: ConditionExpression to prevent duplicates if needed
        });
        try {
            await this.client.send(command);
            this.logger.info(`Assigned relationship: ${pk} -> ${sk}`);
        } catch (error: any) {
            this.logger.error(`Error assigning relationship ${pk} -> ${sk}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to assign ${relationshipType}: ${error.message}`);
        }
    }

    private async remove(pk: string, sk: string, relationshipType: string): Promise<void> {
         const command = new DeleteItemCommand({ // <<< Use DeleteItemCommand
            TableName: this.tableName,
            Key: marshall({ PK: pk, SK: sk }), // <<< Use marshall
            // Optional: ConditionExpression to ensure item exists
        });
         try {
            await this.client.send(command);
            this.logger.info(`Removed relationship: ${pk} -> ${sk}`);
        } catch (error: any) {
             this.logger.error(`Error removing relationship ${pk} -> ${sk}`, error);
             throw new BaseError('DatabaseError', 500, `Failed to remove ${relationshipType}: ${error.message}`);
        }
    }

    // --- Generic Query (Forward Relationship) ---
    private async queryForward(pkPrefix: string, pkValue: string, skPrefix: string): Promise<string[]> {
        const pk = `${pkPrefix}#${pkValue}`;
        const sk = `${skPrefix}#`;
        const queryInput: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)",
            ExpressionAttributeValues: marshall({ // <<< Use marshall
                ":pkval": pk,
                ":skprefix": sk
            }),
            ProjectionExpression: "SK" // Only need the SK
        };

        try {
             // Use helper to handle pagination automatically
            const results = await this.queryAllItems(queryInput);
            // Extract the value part after the prefix (e.g., 'ROLE#admin' -> 'admin')
            return results.map(item => item.SK?.S?.split('#')[1]).filter((val): val is string => !!val);
        } catch (error: any) {
             this.logger.error(`Error querying forward relationship ${pk} -> ${sk}*`, error);
             throw new BaseError('DatabaseError', 500, `Failed to query ${skPrefix}s for ${pkPrefix}: ${error.message}`);
        }
    }

     // --- Generic Query (Reverse Relationship using GSI) ---
     private async queryReverse(skPrefix: string, skValue: string, pkPrefix: string): Promise<string[]> {
        const sk = `${skPrefix}#${skValue}`;
        const pk = `${pkPrefix}#`;
        const queryInput: QueryCommandInput = {
            TableName: this.tableName,
            IndexName: GSI1_NAME, // Assumes GSI1 has SK as PK, PK as SK
            KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", // Query GSI PK (original SK)
            ExpressionAttributeValues: marshall({ // <<< Use marshall
                ":skval": sk,
                ":pkprefix": pk
            }),
            ProjectionExpression: "PK" // Only need the original PK
        };

        try {
            // Use helper to handle pagination automatically
            const results = await this.queryAllItems(queryInput);
            // Extract the value part from the original PK
            return results.map(item => item.PK?.S?.split('#')[1]).filter((val): val is string => !!val);
        } catch (error: any) {
             this.logger.error(`Error querying reverse relationship ${sk} -> ${pk}* using GSI`, error);
             throw new BaseError('DatabaseError', 500, `Failed to query ${pkPrefix}s for ${skPrefix}: ${error.message}`);
        }
    }

    // --- Group <-> Role ---
    findRolesByGroupName = (groupName: string) => this.queryForward('GROUP', groupName, 'ROLE');
    assignRoleToGroup = (groupName: string, roleName: string) => this.assign(`GROUP#${groupName}`, `ROLE#${roleName}`, 'GroupRole');
    removeRoleFromGroup = (groupName: string, roleName: string) => this.remove(`GROUP#${groupName}`, `ROLE#${roleName}`, 'GroupRole');
    findGroupsByRoleName = (roleName: string) => this.queryReverse('ROLE', roleName, 'GROUP');

    // --- Role <-> Permission ---
    findPermissionsByRoleName = (roleName: string) => this.queryForward('ROLE', roleName, 'PERM');
    assignPermissionToRole = (roleName: string, permissionName: string) => this.assign(`ROLE#${roleName}`, `PERM#${permissionName}`, 'RolePermission');
    removePermissionFromRole = (roleName: string, permissionName: string) => this.remove(`ROLE#${roleName}`, `PERM#${permissionName}`, 'RolePermission');
    findRolesByPermissionName = (permissionName: string) => this.queryReverse('PERM', permissionName, 'ROLE');

    // --- User <-> Custom Role ---
    findCustomRolesByUserId = (userId: string) => this.queryForward('USER', userId, 'ROLE');
    assignCustomRoleToUser = (userId: string, roleName: string) => this.assign(`USER#${userId}`, `ROLE#${roleName}`, 'UserCustomRole');
    removeCustomRoleFromUser = (userId: string, roleName: string) => this.remove(`USER#${userId}`, `ROLE#${roleName}`, 'UserCustomRole');

    // --- User <-> Custom Permission ---
    findCustomPermissionsByUserId = (userId: string) => this.queryForward('USER', userId, 'PERM');
    assignCustomPermissionToUser = (userId: string, permissionName: string) => this.assign(`USER#${userId}`, `PERM#${permissionName}`, 'UserCustomPermission');
    removeCustomPermissionFromUser = (userId: string, permissionName: string) => this.remove(`USER#${userId}`, `PERM#${permissionName}`, 'UserCustomPermission');

    // --- Cleanup Implementations ---

    // Generic helper to find items based on PK or SK prefix using Query or GSI Query
    private async findAssignments(pkPrefix: string, pkValue: string, skPrefixFilter?: string): Promise<Array<{ PK: string; SK: string }>>;
    private async findAssignments(skPrefix: string, skValue: string, pkPrefixFilter?: string, useGsi?: boolean): Promise<Array<{ PK: string; SK: string }>>;
    private async findAssignments(prefix1: string, value1: string, prefix2Filter?: string, useGsi: boolean = false): Promise<Array<{ PK: string; SK: string }>> {
        let queryInput: QueryCommandInput;
        const keyProjection = "PK, SK"; // We need both keys for deletion

        if (!useGsi) { // Querying main table by PK
            queryInput = {
                TableName: this.tableName,
                KeyConditionExpression: "PK = :pkval" + (prefix2Filter ? " AND begins_with(SK, :skprefix)" : ""),
                ExpressionAttributeValues: marshall({
                    ":pkval": `${prefix1}#${value1}`,
                    ...(prefix2Filter && { ":skprefix": `${prefix2Filter}#` })
                }),
                ProjectionExpression: keyProjection
            };
        } else { // Querying GSI1 by SK (used as GSI PK)
             queryInput = {
                TableName: this.tableName,
                IndexName: GSI1_NAME,
                KeyConditionExpression: "SK = :skval" + (prefix2Filter ? " AND begins_with(PK, :pkprefix)" : ""),
                ExpressionAttributeValues: marshall({
                    ":skval": `${prefix1}#${value1}`,
                     ...(prefix2Filter && { ":pkprefix": `${prefix2Filter}#` })
                }),
                 ProjectionExpression: keyProjection
            };
        }

        const items = await this.queryAllItems(queryInput);
        // We need PK and SK which are guaranteed strings based on our model
        return items.map(item => ({ PK: item.PK!.S!, SK: item.SK!.S! }));
    }


    async removeAllAssignmentsForUser(userId: string): Promise<void> {
        this.logger.info(`Starting assignment cleanup for user ID: ${userId}`);
        try {
            // Find items where PK = USER#{userId} (custom roles, custom permissions)
            const userAssignments = await this.findAssignments('USER', userId);
            // Note: We assume User->Group relationship is only in Cognito, not stored here.
            // If User->Group was stored here, we'd need another query.

            await this.batchDeleteItems(userAssignments);
            this.logger.info(`Completed assignment cleanup for user ID: ${userId}. Deleted ${userAssignments.length} items.`);
        } catch (error) {
            this.logger.error(`Failed assignment cleanup for user ID: ${userId}`, { error });
            // Re-throw to signal cleanup failure
            throw error;
        }
    }

    async removeAllAssignmentsForGroup(groupName: string): Promise<void> {
        this.logger.info(`Starting assignment cleanup for group: ${groupName}`);
         try {
            // Find items where PK = GROUP#{groupName} (roles assigned to this group)
            const groupAssignments = await this.findAssignments('GROUP', groupName, 'ROLE');

            // We also need to remove this group from any Users if that relationship were stored here
            // Assuming User<->Group is only in Cognito, this is sufficient.

            await this.batchDeleteItems(groupAssignments);
            this.logger.info(`Completed assignment cleanup for group: ${groupName}. Deleted ${groupAssignments.length} items.`);
        } catch (error) {
            this.logger.error(`Failed assignment cleanup for group: ${groupName}`, { error });
            throw error;
        }
    }

    async removeAllAssignmentsForRole(roleName: string): Promise<void> {
        this.logger.info(`Starting assignment cleanup for role: ${roleName}`);
         try {
            // 1. Find permissions assigned TO this role (PK=ROLE#{roleName}, SK starts with PERM#)
            const permissionsAssigned = await this.findAssignments('ROLE', roleName, 'PERM');

            // 2. Find groups this role is assigned TO (using GSI: SK=ROLE#{roleName}, PK starts with GROUP#)
            const groupsWithRole = await this.findAssignments('ROLE', roleName, 'GROUP', true); // useGsi = true

            // 3. Find users this role is assigned TO (using GSI: SK=ROLE#{roleName}, PK starts with USER#)
             const usersWithRole = await this.findAssignments('ROLE', roleName, 'USER', true); // useGsi = true

            const allToDelete = [...permissionsAssigned, ...groupsWithRole, ...usersWithRole];
            await this.batchDeleteItems(allToDelete);
            this.logger.info(`Completed assignment cleanup for role: ${roleName}. Deleted ${allToDelete.length} assignment items.`);
        } catch (error) {
            this.logger.error(`Failed assignment cleanup for role: ${roleName}`, { error });
            throw error;
        }
    }

    async removeAllAssignmentsForPermission(permissionName: string): Promise<void> {
         this.logger.info(`Starting assignment cleanup for permission: ${permissionName}`);
         try {
             // 1. Find roles this permission is assigned TO (using GSI: SK=PERM#{permName}, PK starts with ROLE#)
             const rolesWithPermission = await this.findAssignments('PERM', permissionName, 'ROLE', true);

            // 2. Find users this permission is assigned TO (using GSI: SK=PERM#{permName}, PK starts with USER#)
             const usersWithPermission = await this.findAssignments('PERM', permissionName, 'USER', true);

            const allToDelete = [...rolesWithPermission, ...usersWithPermission];
            await this.batchDeleteItems(allToDelete);
            this.logger.info(`Completed assignment cleanup for permission: ${permissionName}. Deleted ${allToDelete.length} assignment items.`);
        } catch (error) {
            this.logger.error(`Failed assignment cleanup for permission: ${permissionName}`, { error });
            throw error;
        }
    }
}