import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, QueryCommandInput, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from "tsyringe";
import { IAssignmentRepository } from "../../../application/interfaces/IAssignmentRepository";
import { TYPES } from "../../../shared/constants/types";
import { ILogger } from "../../../application/interfaces/ILogger";
import { DynamoDBProvider } from "./dynamodb.client";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { BaseError } from "../../../shared/errors/BaseError";

// Constants for GSIs (Assumed names, configure in DynamoDB)
const GSI1_NAME = 'GSI1'; // Example: GSI with SK as PK and PK as SK (for reverse lookups)

@injectable()
export class DynamoAssignmentRepository implements IAssignmentRepository {
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

    // --- Generic Assignment/Removal ---
    private async assign(pk: string, sk: string, relationshipType: string): Promise<void> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: { PK: pk, SK: sk, EntityType: relationshipType, AssignedAt: new Date().toISOString() },
            // Optional: ConditionExpression to prevent duplicates if needed, though Put is idempotent
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
         const command = new DeleteCommand({
            TableName: this.tableName,
            Key: { PK: pk, SK: sk },
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
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)",
            ExpressionAttributeValues: {
                ":pkval": `${pkPrefix}#${pkValue}`,
                ":skprefix": `${skPrefix}#`
            }
        };
        const command = new QueryCommand(commandInput);
        try {
            const results = await this.client.send(command);
            // Extract the value part after the prefix (e.g., 'ROLE#admin' -> 'admin')
            return results.Items?.map(item => item.SK?.split('#')[1]).filter((val): val is string => !!val) || [];
        } catch (error: any) {
             this.logger.error(`Error querying forward relationship ${pkPrefix}#${pkValue} -> ${skPrefix}#*`, error);
             throw new BaseError('DatabaseError', 500, `Failed to query ${skPrefix}s for ${pkPrefix}: ${error.message}`);
        }
    }

     // --- Generic Query (Reverse Relationship using GSI) ---
     private async queryReverse(skPrefix: string, skValue: string, pkPrefix: string): Promise<string[]> {
        const commandInput: QueryCommandInput = {
            TableName: this.tableName,
            IndexName: GSI1_NAME, // Assumes GSI1 has SK as PK, PK as SK
            KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", // Query GSI PK (original SK)
            ExpressionAttributeValues: {
                ":skval": `${skPrefix}#${skValue}`,
                ":pkprefix": `${pkPrefix}#`
            }
        };
        const command = new QueryCommand(commandInput);
        try {
            const results = await this.client.send(command);
            // Extract the value part from the original PK
            return results.Items?.map(item => item.PK?.split('#')[1]).filter((val): val is string => !!val) || [];
        } catch (error: any) {
             this.logger.error(`Error querying reverse relationship ${skPrefix}#${skValue} -> ${pkPrefix}#* using GSI`, error);
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

    // --- Cleanup (Requires Querying all related items and Batch Deleting) ---
    // Implement these using Query followed by BatchWriteCommand for efficiency
    async removeAllAssignmentsForUser(userId: string): Promise<void> {
        this.logger.warn(`Cleanup for user ${userId} not fully implemented.`);
        // Query USER#userId PK for all SKs (ROLE#, PERM#)
        // Batch delete items
    }
    async removeAllAssignmentsForGroup(groupName: string): Promise<void> {
         this.logger.warn(`Cleanup for group ${groupName} not fully implemented.`);
        // Query GROUP#groupName PK for all SKs (ROLE#)
        // Query GSI for PK=USER#* where SK=GROUP#groupName (if User-Group stored here)
        // Batch delete items
    }
    async removeAllAssignmentsForRole(roleName: string): Promise<void> {
         this.logger.warn(`Cleanup for role ${roleName} not fully implemented.`);
        // Query ROLE#roleName PK for all SKs (PERM#)
        // Query GSI for PK=GROUP#* where SK=ROLE#roleName
        // Query GSI for PK=USER#* where SK=ROLE#roleName
        // Batch delete items
    }
    async removeAllAssignmentsForPermission(permissionName: string): Promise<void> {
         this.logger.warn(`Cleanup for permission ${permissionName} not fully implemented.`);
        // Query GSI for PK=ROLE#* where SK=PERM#permissionName
        // Query GSI for PK=USER#* where SK=PERM#permissionName
        // Batch delete items
    }
}
