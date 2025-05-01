// tests/unit/infrastructure/persistence/DynamoAssignmentRepository.spec.ts

import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

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
        // These tests would be more complex, involving mocking Query to find items
        // and then mocking BatchWriteCommand to delete them.
        // For now, just test that they log the warning.

        it('removeAllAssignmentsForUser should log warning', async () => {
            await repository.removeAllAssignmentsForUser(userId);
            expect(logger.warn).toHaveBeenCalledWith(`Cleanup for user ${userId} not fully implemented.`);
        });
        it('removeAllAssignmentsForGroup should log warning', async () => {
            await repository.removeAllAssignmentsForGroup(groupName);
            expect(logger.warn).toHaveBeenCalledWith(`Cleanup for group ${groupName} not fully implemented.`);
        });
        it('removeAllAssignmentsForRole should log warning', async () => {
            await repository.removeAllAssignmentsForRole(roleName);
            expect(logger.warn).toHaveBeenCalledWith(`Cleanup for role ${roleName} not fully implemented.`);
        });
        it('removeAllAssignmentsForPermission should log warning', async () => {
            await repository.removeAllAssignmentsForPermission(permName);
            expect(logger.warn).toHaveBeenCalledWith(`Cleanup for permission ${permName} not fully implemented.`);
        });

        // Example of how a full test might look (requires implementing the method first)
        /*
        it('removeAllAssignmentsForRole should query and batch delete items', async () => {
            const rolePerms = [{ PK: `ROLE#${roleName}`, SK: `PERM#perm1` }];
            const groupRoles = [{ PK: `GROUP#group1`, SK: `ROLE#${roleName}` }]; // From GSI query

            // Mock Query for ROLE#... PK
            ddbMock.on(QueryCommand, { KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)", ExpressionAttributeValues: { ":pkval": `ROLE#${roleName}`, ":skprefix": "PERM#" }})
                   .resolves({ Items: rolePerms });
            // Mock Query for GSI lookup (Groups)
             ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: { ":skval": `ROLE#${roleName}`, ":pkprefix": "GROUP#" }})
                   .resolves({ Items: groupRoles });
             // Mock Query for GSI lookup (Users - assuming pattern)
             ddbMock.on(QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: { ":skval": `ROLE#${roleName}`, ":pkprefix": "USER#" }})
                    .resolves({ Items: [] }); // No users assigned this role directly

            // Mock BatchWriteCommand
            ddbMock.on(BatchWriteCommand).resolves({});

            await repository.removeAllAssignmentsForRole(roleName); // Call the *implemented* method

            // Expect Query calls were made
            expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 3);
            // Expect BatchWriteCommand was called with DeleteRequests for the found items
             expect(ddbMock).toHaveReceivedCommandWith(BatchWriteCommand, {
                 RequestItems: {
                     [tableName]: expect.arrayContaining([
                         { DeleteRequest: { Key: { PK: `ROLE#${roleName}`, SK: `PERM#perm1` } } },
                         { DeleteRequest: { Key: { PK: `GROUP#group1`, SK: `ROLE#${roleName}` } } },
                     ])
                 }
             });
        });
        */
    });
});