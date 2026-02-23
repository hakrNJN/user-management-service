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
import { marshall } from "@aws-sdk/util-dynamodb";
import { inject, injectable } from "tsyringe";
import { IAssignmentRepository } from "../../../application/interfaces/IAssignmentRepository";
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { ILogger } from "../../../application/interfaces/ILogger";
import { TYPES } from "../../../shared/constants/types";
import { BaseError } from "../../../shared/errors/BaseError";
import { DynamoDBProvider } from "./dynamodb.client";

const GSI1_NAME = 'EntityTypeGSI';

@injectable()
export class DynamoAssignmentRepository implements IAssignmentRepository {
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

    private getTenantPrefix(tenantId: string, entityPrefix: string, entityId: string): string {
        return `TENANT#${tenantId}#${entityPrefix}#${entityId}`;
    }

    private getTargetSK(targetPrefix: string, targetId: string): string {
        return `${targetPrefix}#${targetId}`;
    }

    private async batchDeleteItems(itemsToDelete: Array<{ PK: string; SK: string }>): Promise<void> {
        if (!itemsToDelete || itemsToDelete.length === 0) return;

        const BATCH_SIZE = 25;
        for (let i = 0; i < itemsToDelete.length; i += BATCH_SIZE) {
            const batch = itemsToDelete.slice(i, i + BATCH_SIZE);
            const deleteRequests: WriteRequest[] = batch.map(item => ({
                DeleteRequest: { Key: marshall({ PK: item.PK, SK: item.SK }) }
            }));

            const batchWriteInput: BatchWriteItemCommandInput = { RequestItems: { [this.tableName]: deleteRequests } };
            const command = new BatchWriteItemCommand(batchWriteInput);

            try {
                let result = await this.client.send(command);
                while (result.UnprocessedItems && result.UnprocessedItems[this.tableName] && result.UnprocessedItems[this.tableName].length > 0) {
                    this.logger.warn(`Retrying ${result.UnprocessedItems[this.tableName].length} unprocessed delete items...`);
                    const retryInput: BatchWriteItemCommandInput = { RequestItems: result.UnprocessedItems };
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    result = await this.client.send(new BatchWriteItemCommand(retryInput));
                }
            } catch (error: any) {
                this.logger.error(`Error during batch delete operation`, { error });
                throw new BaseError('DatabaseError', 500, `Failed during batch delete: ${error.message}`);
            }
        }
    }

    private async queryAllItems(queryInput: QueryCommandInput): Promise<Array<Record<string, any>>> {
        let allItems: Array<Record<string, any>> = [];
        let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

        do {
            queryInput.ExclusiveStartKey = lastEvaluatedKey;
            const command = new QueryCommand(queryInput);
            try {
                const results = await this.client.send(command);
                if (results.Items) allItems = allItems.concat(results.Items);
                lastEvaluatedKey = results.LastEvaluatedKey;
            } catch (error: any) {
                this.logger.error("Error during paginated query", { queryInput, error });
                throw new BaseError('DatabaseError', 500, `Failed during query: ${error.message}`);
            }
        } while (lastEvaluatedKey);

        return allItems;
    }

    private async assign(tenantId: string, sourcePrefix: string, sourceValue: string, targetPrefix: string, targetValue: string, relationshipType: string): Promise<void> {
        const pk = this.getTenantPrefix(tenantId, sourcePrefix, sourceValue);
        const sk = this.getTargetSK(targetPrefix, targetValue);

        const item = {
            PK: pk,
            SK: sk,
            EntityType: relationshipType,
            tenantId,
            AssignedAt: new Date().toISOString(),
            EntityTypeGSI_PK: this.getTenantPrefix(tenantId, targetPrefix, targetValue), // Fully isolated reverse lookup
            EntityTypeGSI_SK: pk,
        };

        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
        });

        const MAX_RETRIES = 5;
        let retries = 0, delay = 100;

        while (retries < MAX_RETRIES) {
            try {
                await this.client.send(command);
                this.logger.info(`Assigned relationship: ${pk} -> ${sk}`);
                return;
            } catch (error: any) {
                if (error.name === 'ProvisionedThroughputExceededException' || error.name === 'ThrottlingException') {
                    this.logger.warn(`Throughput exceeded for ${relationshipType}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; retries++;
                } else {
                    this.logger.error(`Error assigning relationship ${pk} -> ${sk}`, error);
                    throw new BaseError('DatabaseError', 500, `Failed to assign ${relationshipType}: ${error.message}`);
                }
            }
        }
        throw new BaseError('DatabaseError', 500, `Failed to assign ${relationshipType} due to throughput.`);
    }

    private async remove(tenantId: string, sourcePrefix: string, sourceValue: string, targetPrefix: string, targetValue: string, relationshipType: string): Promise<void> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({ PK: this.getTenantPrefix(tenantId, sourcePrefix, sourceValue), SK: this.getTargetSK(targetPrefix, targetValue) }),
        });
        try {
            await this.client.send(command);
            this.logger.info(`Removed relationship: ${sourcePrefix}#${sourceValue} -> ${targetPrefix}#${targetValue}`);
        } catch (error: any) {
            this.logger.error(`Error removing relationship`, error);
            throw new BaseError('DatabaseError', 500, `Failed to remove ${relationshipType}: ${error.message}`);
        }
    }

    private async queryForward(tenantId: string, pkPrefix: string, pkValue: string, skPrefix: string): Promise<string[]> {
        const pk = this.getTenantPrefix(tenantId, pkPrefix, pkValue);
        const queryInput: QueryCommandInput = {
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)",
            ExpressionAttributeValues: marshall({ ":pkval": pk, ":skprefix": `${skPrefix}#` }),
            ProjectionExpression: "SK"
        };

        try {
            const results = await this.queryAllItems(queryInput);
            return results.map(item => item.SK?.S?.split('#')[1]).filter((val): val is string => !!val);
        } catch (error: any) {
            this.logger.error(`Error querying forward relationship`, error);
            throw new BaseError('DatabaseError', 500, `Failed to query forward: ${error.message}`);
        }
    }

    private async queryReverse(tenantId: string, skPrefix: string, skValue: string, pkPrefix: string): Promise<string[]> {
        const gsiPk = this.getTenantPrefix(tenantId, skPrefix, skValue);
        const pkSearchPrefix = this.getTenantPrefix(tenantId, pkPrefix, ''); // Example: TENANT#tenantId#GROUP#

        const queryInput: QueryCommandInput = {
            TableName: this.tableName,
            IndexName: GSI1_NAME,
            KeyConditionExpression: "EntityTypeGSI_PK = :skval AND begins_with(EntityTypeGSI_SK, :pkprefix)",
            ExpressionAttributeValues: marshall({ ":skval": gsiPk, ":pkprefix": pkSearchPrefix }),
            ProjectionExpression: "PK"
        };

        try {
            const results = await this.queryAllItems(queryInput);
            // PK format is  TENANT#{tenantId}#{pkPrefix}#{value}, so we need to extract the {value} part
            // It splits by '#' and gets the 4th element (index 3)
            return results.map(item => item.PK?.S?.split('#')[3]).filter((val): val is string => !!val);
        } catch (error: any) {
            this.logger.error(`Error querying reverse relationship`, error);
            throw new BaseError('DatabaseError', 500, `Failed to query reverse: ${error.message}`);
        }
    }

    findRolesByGroupName = (tenantId: string, groupName: string) => this.queryForward(tenantId, 'GROUP', groupName, 'ROLE');
    assignRoleToGroup = (tenantId: string, groupName: string, roleName: string) => this.assign(tenantId, 'GROUP', groupName, 'ROLE', roleName, 'GroupRole');
    removeRoleFromGroup = (tenantId: string, groupName: string, roleName: string) => this.remove(tenantId, 'GROUP', groupName, 'ROLE', roleName, 'GroupRole');
    findGroupsByRoleName = (tenantId: string, roleName: string) => this.queryReverse(tenantId, 'ROLE', roleName, 'GROUP');

    findPermissionsByRoleName = (tenantId: string, roleName: string) => this.queryForward(tenantId, 'ROLE', roleName, 'PERM');
    assignPermissionToRole = (tenantId: string, roleName: string, permissionName: string) => this.assign(tenantId, 'ROLE', roleName, 'PERM', permissionName, 'RolePermission');
    removePermissionFromRole = (tenantId: string, roleName: string, permissionName: string) => this.remove(tenantId, 'ROLE', roleName, 'PERM', permissionName, 'RolePermission');
    findRolesByPermissionName = (tenantId: string, permissionName: string) => this.queryReverse(tenantId, 'PERM', permissionName, 'ROLE');

    findCustomRolesByUserId = (tenantId: string, userId: string) => this.queryForward(tenantId, 'USER', userId, 'ROLE');
    assignCustomRoleToUser = (tenantId: string, userId: string, roleName: string) => this.assign(tenantId, 'USER', userId, 'ROLE', roleName, 'UserCustomRole');
    removeCustomRoleFromUser = (tenantId: string, userId: string, roleName: string) => this.remove(tenantId, 'USER', userId, 'ROLE', roleName, 'UserCustomRole');
    findUsersByRoleName = (tenantId: string, roleName: string) => this.queryReverse(tenantId, 'ROLE', roleName, 'USER');

    findCustomPermissionsByUserId = (tenantId: string, userId: string) => this.queryForward(tenantId, 'USER', userId, 'PERM');
    assignCustomPermissionToUser = (tenantId: string, userId: string, permissionName: string) => this.assign(tenantId, 'USER', userId, 'PERM', permissionName, 'UserCustomPermission');
    removeCustomPermissionFromUser = (tenantId: string, userId: string, permissionName: string) => this.remove(tenantId, 'USER', userId, 'PERM', permissionName, 'UserCustomPermission');
    findUsersByPermissionName = (tenantId: string, permissionName: string) => this.queryReverse(tenantId, 'PERM', permissionName, 'USER');


    private async findAssignments(tenantId: string, prefix1: string, value1: string, prefix2Filter?: string, useGsi: boolean = false): Promise<Array<{ PK: string; SK: string }>> {
        let queryInput: QueryCommandInput;
        const keyProjection = "PK, SK";

        if (!useGsi) {
            queryInput = {
                TableName: this.tableName,
                KeyConditionExpression: "PK = :pkval" + (prefix2Filter ? " AND begins_with(SK, :skprefix)" : ""),
                ExpressionAttributeValues: marshall({
                    ":pkval": this.getTenantPrefix(tenantId, prefix1, value1),
                    ...(prefix2Filter && { ":skprefix": `${prefix2Filter}#` })
                }),
                ProjectionExpression: keyProjection
            };
        } else {
            queryInput = {
                TableName: this.tableName,
                IndexName: GSI1_NAME,
                KeyConditionExpression: "EntityTypeGSI_PK = :skval AND begins_with(EntityTypeGSI_SK, :pkprefix)",
                ExpressionAttributeValues: marshall({
                    ":skval": this.getTenantPrefix(tenantId, prefix1, value1),
                    ...(prefix2Filter && { ":pkprefix": this.getTenantPrefix(tenantId, prefix2Filter, '') })
                }),
                ProjectionExpression: keyProjection
            };
        }

        const items = await this.queryAllItems(queryInput);
        return items.map(item => ({ PK: item.PK!.S!, SK: item.SK!.S! }));
    }

    async removeAllAssignmentsForUser(tenantId: string, userId: string): Promise<void> {
        const userAssignments = await this.findAssignments(tenantId, 'USER', userId);
        await this.batchDeleteItems(userAssignments);
    }

    async removeAllAssignmentsForGroup(tenantId: string, groupName: string): Promise<void> {
        const groupAssignments = await this.findAssignments(tenantId, 'GROUP', groupName, 'ROLE');
        await this.batchDeleteItems(groupAssignments);
    }

    async removeAllAssignmentsForRole(tenantId: string, roleName: string): Promise<void> {
        const permissionsAssigned = await this.findAssignments(tenantId, 'ROLE', roleName, 'PERM');
        const groupsWithRole = await this.findAssignments(tenantId, 'ROLE', roleName, 'GROUP', true);
        const usersWithRole = await this.findAssignments(tenantId, 'ROLE', roleName, 'USER', true);
        await this.batchDeleteItems([...permissionsAssigned, ...groupsWithRole, ...usersWithRole]);
    }

    async removeAllAssignmentsForPermission(tenantId: string, permissionName: string): Promise<void> {
        const rolesWithPermission = await this.findAssignments(tenantId, 'PERM', permissionName, 'ROLE', true);
        const usersWithPermission = await this.findAssignments(tenantId, 'PERM', permissionName, 'USER', true);
        await this.batchDeleteItems([...rolesWithPermission, ...usersWithPermission]);
    }
}