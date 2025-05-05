// tests/unit/infrastructure/persistence/DynamoAssignmentRepository.spec.ts
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import 'reflect-metadata';

import { BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { DynamoAssignmentRepository } from '../../../../src/infrastructure/persistence/dynamodb/DynamoAssignmentRepository';
import { DynamoDBProvider } from '../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { BaseError } from "../../../../src/shared/errors/BaseError";
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoAssignmentRepository', () => {
    let repository: DynamoAssignmentRepository;
    let configService: jest.Mocked<IConfigService>;
    let logger: jest.Mocked<ILogger>;
    const tableName = 'test-authz-table';
    const GSI1_NAME = 'GSI1'; // Match constant in repo

    const groupName = 'editors';
    const roleName = 'document-editor';
    const permName = 'doc:edit';
    const userId = 'user-123';

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();

        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        configService.getOrThrow.mockReturnValue(tableName);

        const mockProvider = new DynamoDBProvider(configService);
        repository = new DynamoAssignmentRepository(configService, logger, mockProvider);
    });

    // --- Test assign (private helper used by others) ---
    describe('assign (via public methods)', () => {
        it('should call PutCommand correctly for assignRoleToGroup', async () => {
            ddbMock.on(PutCommand).resolves({});
            await repository.assignRoleToGroup(groupName, roleName);

            expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
                TableName: tableName,
                Item: {
                    PK: `GROUP#${groupName}`,
                    SK: `ROLE#${roleName}`,
                    EntityType: 'GroupRole',
                    AssignedAt: expect.any(String),
                }
            });
            expect(logger.info).toHaveBeenCalledWith(`Assigned relationship: GROUP#${groupName} -> ROLE#${roleName}`);
        });

        it('should call PutCommand correctly for assignPermissionToRole', async () => {
            ddbMock.on(PutCommand).resolves({});
            await repository.assignPermissionToRole(roleName, permName);
            expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
                Item: expect.objectContaining({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}`, EntityType: 'RolePermission' })
            });
        });

        // Add tests for assignCustomRoleToUser, assignCustomPermissionToUser

        it('should throw DatabaseError on Put failure', async () => {
            const error = new Error("Put failed");
            ddbMock.on(PutCommand).rejects(error);

            await expect(repository.assignRoleToGroup(groupName, roleName)).rejects.toThrow(BaseError);
            await expect(repository.assignRoleToGroup(groupName, roleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error assigning relationship'), error);
        });
    });

    // --- Test remove (private helper used by others) ---
    describe('remove (via public methods)', () => {
        it('should call DeleteCommand correctly for removeRoleFromGroup', async () => {
            ddbMock.on(DeleteCommand).resolves({});
            await repository.removeRoleFromGroup(groupName, roleName);

            expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
                TableName: tableName,
                Key: { PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` },
            });
            expect(logger.info).toHaveBeenCalledWith(`Removed relationship: GROUP#${groupName} -> ROLE#${roleName}`);
        });

        // Add tests for removePermissionFromRole, removeCustomRoleFromUser, removeCustomPermissionFromUser

        it('should throw DatabaseError on Delete failure', async () => {
            const error = new Error("Delete failed");
            ddbMock.on(DeleteCommand).rejects(error);
            await expect(repository.removeRoleFromGroup(groupName, roleName)).rejects.toThrow(BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error removing relationship'), error);
        });
    });

    // --- Test queryForward (private helper used by others) ---
    describe('queryForward (via public methods)', () => {
        it('should return assigned roles for a group (findRolesByGroupName)', async () => {
            const items = [
                { PK: `GROUP#${groupName}`, SK: `ROLE#role1`, EntityType: 'GroupRole' },
                { PK: `GROUP#${groupName}`, SK: `ROLE#role2`, EntityType: 'GroupRole' },
            ];
            ddbMock.on(QueryCommand).resolves({ Items: items });

            const result = await repository.findRolesByGroupName(groupName);

            expect(result).toEqual(['role1', 'role2']);
            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
                TableName: tableName,
                KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)",
                ExpressionAttributeValues: {
                    ":pkval": `GROUP#${groupName}`,
                    ":skprefix": "ROLE#"
                }
            });
        });

        it('should return assigned permissions for a role (findPermissionsByRoleName)', async () => {
            const items = [{ PK: `ROLE#${roleName}`, SK: `PERM#perm1` }];
            ddbMock.on(QueryCommand).resolves({ Items: items });
            const result = await repository.findPermissionsByRoleName(roleName);
            expect(result).toEqual(['perm1']);
            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
                ExpressionAttributeValues: { ":pkval": `ROLE#${roleName}`, ":skprefix": "PERM#" }
            });
        });

        // Add tests for findCustomRolesByUserId, findCustomPermissionsByUserId

        it('should return empty array if no assignments found', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await repository.findRolesByGroupName(groupName);
            expect(result).toEqual([]);
        });

        it('should throw DatabaseError on Query failure', async () => {
            const error = new Error("Query failed");
            ddbMock.on(QueryCommand).rejects(error);
            await expect(repository.findRolesByGroupName(groupName)).rejects.toThrow(BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error querying forward relationship'), error);
        });
    });

    // --- Test queryReverse (private helper used by others) ---
    describe('queryReverse (via public methods)', () => {
        it('should return assigned groups for a role using GSI (findGroupsByRoleName)', async () => {
            // Note: Items returned from GSI query contain original PK/SK
            const items = [
                { PK: `GROUP#group1`, SK: `ROLE#${roleName}`, EntityType: 'GroupRole' }, // GSI query returns full item
                { PK: `GROUP#group2`, SK: `ROLE#${roleName}`, EntityType: 'GroupRole' },
            ];
            ddbMock.on(QueryCommand).resolves({ Items: items });

            const result = await repository.findGroupsByRoleName(roleName);

            expect(result).toEqual(['group1', 'group2']);
            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
                TableName: tableName,
                IndexName: GSI1_NAME,
                KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)",
                ExpressionAttributeValues: {
                    ":skval": `ROLE#${roleName}`,
                    ":pkprefix": "GROUP#"
                }
            });
        });

        it('should return assigned roles for a permission using GSI (findRolesByPermissionName)', async () => {
            const items = [{ PK: `ROLE#roleA`, SK: `PERM#${permName}` }];
            ddbMock.on(QueryCommand).resolves({ Items: items });
            const result = await repository.findRolesByPermissionName(permName);
            expect(result).toEqual(['roleA']);
            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
                IndexName: GSI1_NAME,
                ExpressionAttributeValues: { ":skval": `PERM#${permName}`, ":pkprefix": "ROLE#" }
            });
        });

        // Add tests for finding users by role/permission if needed (might require different GSI)

        it('should return empty array if no reverse assignments found', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await repository.findGroupsByRoleName(roleName);
            expect(result).toEqual([]);
        });

        it('should throw DatabaseError on GSI Query failure', async () => {
            const error = new Error("GSI Query failed");
            ddbMock.on(QueryCommand).rejects(error);
            await expect(repository.findGroupsByRoleName(roleName)).rejects.toThrow(BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error querying reverse relationship'), error);
        });
    });

    // --- Test Cleanup Methods (Placeholder tests as implementations are incomplete) ---
    describe('removeAllAssignmentsFor*', () => {
        const userRoles = [marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
        const userPerms = [marshall({ PK: `USER#${userId}`, SK: `PERM#${permName}` })];
        const groupRoles = [marshall({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` })];
        const rolePerms = [marshall({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` })];
        // Items returned from GSI queries need PK/SK for deletion
        const rolesWithPerm = [marshall({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` })];
        const usersWithRole = [marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];

        it('removeAllAssignmentsForUser should query PK and batch delete', async () => {
            // Mock Query for USER# PK
            ddbMock.on(QueryCommand, { KeyConditionExpression: "PK = :pkval", ExpressionAttributeValues: marshall({ ":pkval": `USER#${userId}` }) })
                .resolvesOnce({ Items: [...userRoles, ...userPerms] }); // Combine results for single PK query
            // Mock BatchWrite to succeed
            ddbMock.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForUser(userId);

            // Verify Query was called correctly
            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
                KeyConditionExpression: "PK = :pkval",
                ExpressionAttributeValues: marshall({ ":pkval": `USER#${userId}` }),
                ProjectionExpression: "PK, SK",
            });
            // Verify BatchWrite was called with correct DeleteRequests
            expect(ddbMock).toHaveReceivedCommandWith(BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } },
                        { DeleteRequest: { Key: marshall({ PK: `USER#${userId}`, SK: `PERM#${permName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for user ID: ${userId}. Deleted 2 items.`));
        });

        it('removeAllAssignmentsForGroup should query PK and batch delete', async () => {
            // Mock Query for GROUP# PK (only finds roles assigned to group)
            ddbMock.on(QueryCommand, { KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)", ExpressionAttributeValues: marshall({ ":pkval": `GROUP#${groupName}`, ":skprefix": "ROLE#" }) })
                .resolves({ Items: groupRoles });
            ddbMock.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForGroup(groupName);

            expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, { ProjectionExpression: "PK, SK" });
            expect(ddbMock).toHaveReceivedCommandWith(BatchWriteItemCommand, {
                RequestItems: { [tableName]: [{ DeleteRequest: { Key: marshall({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` }) } }] }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for group: ${groupName}. Deleted 1 items.`));
        });

        it('removeAllAssignmentsForRole should query PK and GSI, then batch delete', async () => {
            // Mock Query for ROLE# PK (finds assigned permissions)
            ddbMock.on(QueryCommand, { KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)", ExpressionAttributeValues: marshall({ ":pkval": `ROLE#${roleName}`, ":skprefix": "PERM#" }) })
                .resolves({ Items: rolePerms });
            // Mock Query for GSI lookup (finds groups with this role)
            ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: marshall({ ":skval": `ROLE#${roleName}`, ":pkprefix": "GROUP#" }) })
                .resolves({ Items: groupRoles }); // Group assignment item
            // Mock Query for GSI lookup (finds users with this role)
            ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: marshall({ ":skval": `ROLE#${roleName}`, ":pkprefix": "USER#" }) })
                .resolves({ Items: usersWithRole }); // User assignment item
            // Mock BatchWrite
            ddbMock.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForRole(roleName);

            // Verify all 3 queries were made
            expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 3);
            // Verify BatchWrite payload
            expect(ddbMock).toHaveReceivedCommandWith(BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: marshall({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` }) } },
                        { DeleteRequest: { Key: marshall({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` }) } },
                        { DeleteRequest: { Key: marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for role: ${roleName}. Deleted 3 assignment items.`));
        });

        it('removeAllAssignmentsForPermission should query GSI and batch delete', async () => {
            // Mock Query for GSI lookup (finds roles with this perm)
            ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: marshall({ ":skval": `PERM#${permName}`, ":pkprefix": "ROLE#" }) })
                .resolves({ Items: rolesWithPerm });
            // Mock Query for GSI lookup (finds users with this perm)
            ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: marshall({ ":skval": `PERM#${permName}`, ":pkprefix": "USER#" }) })
                .resolves({ Items: userPerms });
            ddbMock.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForPermission(permName);

            expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 2);
            expect(ddbMock).toHaveReceivedCommandWith(BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: marshall({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` }) } },
                        { DeleteRequest: { Key: marshall({ PK: `USER#${userId}`, SK: `PERM#${permName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for permission: ${permName}. Deleted 2 assignment items.`));
        });

        it('should handle empty results during cleanup queries', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] }); // All queries return empty
            ddbMock.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForRole(roleName); // Example call

            expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 3); // Queries still run
            expect(ddbMock).not.toHaveReceivedCommand(BatchWriteItemCommand); // No batch write needed
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for role: ${roleName}. Deleted 0 assignment items.`));
        });

        it('should handle unprocessed items during batch delete', async () => {
            const itemsToDelete = [marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
            const unprocessedKey = { DeleteRequest: { Key: marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } };

            ddbMock.on(QueryCommand).resolves({ Items: itemsToDelete });
            // First BatchWrite returns unprocessed items, second succeeds
            ddbMock.on(BatchWriteItemCommand)
                .resolvesOnce({ UnprocessedItems: { [tableName]: [unprocessedKey] } })
                .resolvesOnce({ UnprocessedItems: {} });

            await repository.removeAllAssignmentsForUser(userId);

            expect(ddbMock).toHaveReceivedCommandTimes(BatchWriteItemCommand, 2); // Initial + Retry
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Retrying 1 unprocessed delete items...`));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for user ID: ${userId}. Deleted 1 items.`));
        });

        it('should throw DatabaseError if query fails during cleanup', async () => {
            const queryError = new Error('Query failed during cleanup');
            ddbMock.on(QueryCommand).rejects(queryError);
            await expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(BaseError);
            await expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(/Failed during query/);
            expect(ddbMock).not.toHaveReceivedCommand(BatchWriteItemCommand);
        });

        it('should throw DatabaseError if batch delete fails', async () => {
            const itemsToDelete = [marshall({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
            const batchError = new Error('BatchWrite failed');
            ddbMock.on(QueryCommand).resolves({ Items: itemsToDelete });
            ddbMock.on(BatchWriteItemCommand).rejects(batchError);

            await expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(BaseError);
            await expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(/Failed during batch delete/);
        });
    });
});