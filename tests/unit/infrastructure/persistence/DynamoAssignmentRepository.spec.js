"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// tests/unit/infrastructure/persistence/DynamoAssignmentRepository.spec.ts
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
require("reflect-metadata");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const DynamoAssignmentRepository_1 = require("../../../../src/infrastructure/persistence/dynamodb/DynamoAssignmentRepository");
const dynamodb_client_1 = require("../../../../src/infrastructure/persistence/dynamodb/dynamodb.client");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../mocks/config.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('DynamoAssignmentRepository', () => {
    let repository;
    let configService;
    let logger;
    const tableName = 'test-authz-table';
    const GSI1_NAME = 'GSI1'; // Match constant in repo
    const groupName = 'editors';
    const roleName = 'document-editor';
    const permName = 'doc:edit';
    const userId = 'user-123';
    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        configService.getOrThrow.mockReturnValue(tableName);
        const mockProvider = new dynamodb_client_1.DynamoDBProvider(configService);
        repository = new DynamoAssignmentRepository_1.DynamoAssignmentRepository(configService, logger, mockProvider);
    });
    // --- Test assign (private helper used by others) ---
    describe('assign (via public methods)', () => {
        it('should call PutCommand correctly for assignRoleToGroup', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            yield repository.assignRoleToGroup(groupName, roleName);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: tableName,
                Item: {
                    PK: `GROUP#${groupName}`,
                    SK: `ROLE#${roleName}`,
                    EntityType: 'GroupRole',
                    AssignedAt: expect.any(String),
                }
            });
            expect(logger.info).toHaveBeenCalledWith(`Assigned relationship: GROUP#${groupName} -> ROLE#${roleName}`);
        }));
        it('should call PutCommand correctly for assignPermissionToRole', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            yield repository.assignPermissionToRole(roleName, permName);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                Item: expect.objectContaining({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}`, EntityType: 'RolePermission' })
            });
        }));
        // Add tests for assignCustomRoleToUser, assignCustomPermissionToUser
        it('should throw DatabaseError on Put failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Put failed");
            ddbMock.on(lib_dynamodb_1.PutCommand).rejects(error);
            yield expect(repository.assignRoleToGroup(groupName, roleName)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.assignRoleToGroup(groupName, roleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error assigning relationship'), error);
        }));
    });
    // --- Test remove (private helper used by others) ---
    describe('remove (via public methods)', () => {
        it('should call DeleteCommand correctly for removeRoleFromGroup', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            yield repository.removeRoleFromGroup(groupName, roleName);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.DeleteCommand, {
                TableName: tableName,
                Key: { PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` },
            });
            expect(logger.info).toHaveBeenCalledWith(`Removed relationship: GROUP#${groupName} -> ROLE#${roleName}`);
        }));
        // Add tests for removePermissionFromRole, removeCustomRoleFromUser, removeCustomPermissionFromUser
        it('should throw DatabaseError on Delete failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Delete failed");
            ddbMock.on(lib_dynamodb_1.DeleteCommand).rejects(error);
            yield expect(repository.removeRoleFromGroup(groupName, roleName)).rejects.toThrow(BaseError_1.BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error removing relationship'), error);
        }));
    });
    // --- Test queryForward (private helper used by others) ---
    describe('queryForward (via public methods)', () => {
        it('should return assigned roles for a group (findRolesByGroupName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const items = [
                { PK: `GROUP#${groupName}`, SK: `ROLE#role1`, EntityType: 'GroupRole' },
                { PK: `GROUP#${groupName}`, SK: `ROLE#role2`, EntityType: 'GroupRole' },
            ];
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: items });
            const result = yield repository.findRolesByGroupName(groupName);
            expect(result).toEqual(['role1', 'role2']);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, {
                TableName: tableName,
                KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)",
                ExpressionAttributeValues: {
                    ":pkval": `GROUP#${groupName}`,
                    ":skprefix": "ROLE#"
                }
            });
        }));
        it('should return assigned permissions for a role (findPermissionsByRoleName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const items = [{ PK: `ROLE#${roleName}`, SK: `PERM#perm1` }];
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: items });
            const result = yield repository.findPermissionsByRoleName(roleName);
            expect(result).toEqual(['perm1']);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, {
                ExpressionAttributeValues: { ":pkval": `ROLE#${roleName}`, ":skprefix": "PERM#" }
            });
        }));
        // Add tests for findCustomRolesByUserId, findCustomPermissionsByUserId
        it('should return empty array if no assignments found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: [] });
            const result = yield repository.findRolesByGroupName(groupName);
            expect(result).toEqual([]);
        }));
        it('should throw DatabaseError on Query failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Query failed");
            ddbMock.on(lib_dynamodb_1.QueryCommand).rejects(error);
            yield expect(repository.findRolesByGroupName(groupName)).rejects.toThrow(BaseError_1.BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error querying forward relationship'), error);
        }));
    });
    // --- Test queryReverse (private helper used by others) ---
    describe('queryReverse (via public methods)', () => {
        it('should return assigned groups for a role using GSI (findGroupsByRoleName)', () => __awaiter(void 0, void 0, void 0, function* () {
            // Note: Items returned from GSI query contain original PK/SK
            const items = [
                { PK: `GROUP#group1`, SK: `ROLE#${roleName}`, EntityType: 'GroupRole' }, // GSI query returns full item
                { PK: `GROUP#group2`, SK: `ROLE#${roleName}`, EntityType: 'GroupRole' },
            ];
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: items });
            const result = yield repository.findGroupsByRoleName(roleName);
            expect(result).toEqual(['group1', 'group2']);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, {
                TableName: tableName,
                IndexName: GSI1_NAME,
                KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)",
                ExpressionAttributeValues: {
                    ":skval": `ROLE#${roleName}`,
                    ":pkprefix": "GROUP#"
                }
            });
        }));
        it('should return assigned roles for a permission using GSI (findRolesByPermissionName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const items = [{ PK: `ROLE#roleA`, SK: `PERM#${permName}` }];
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: items });
            const result = yield repository.findRolesByPermissionName(permName);
            expect(result).toEqual(['roleA']);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, {
                IndexName: GSI1_NAME,
                ExpressionAttributeValues: { ":skval": `PERM#${permName}`, ":pkprefix": "ROLE#" }
            });
        }));
        // Add tests for finding users by role/permission if needed (might require different GSI)
        it('should return empty array if no reverse assignments found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: [] });
            const result = yield repository.findGroupsByRoleName(roleName);
            expect(result).toEqual([]);
        }));
        it('should throw DatabaseError on GSI Query failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("GSI Query failed");
            ddbMock.on(lib_dynamodb_1.QueryCommand).rejects(error);
            yield expect(repository.findGroupsByRoleName(roleName)).rejects.toThrow(BaseError_1.BaseError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error querying reverse relationship'), error);
        }));
    });
    // --- Test Cleanup Methods (Placeholder tests as implementations are incomplete) ---
    describe('removeAllAssignmentsFor*', () => {
        const userRoles = [(0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
        const userPerms = [(0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `PERM#${permName}` })];
        const groupRoles = [(0, util_dynamodb_1.marshall)({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` })];
        const rolePerms = [(0, util_dynamodb_1.marshall)({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` })];
        // Items returned from GSI queries need PK/SK for deletion
        const rolesWithPerm = [(0, util_dynamodb_1.marshall)({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` })];
        const usersWithRole = [(0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
        it('removeAllAssignmentsForUser should query PK and batch delete', () => __awaiter(void 0, void 0, void 0, function* () {
            // Mock Query for USER# PK
            ddbMock.on(lib_dynamodb_1.QueryCommand, { KeyConditionExpression: "PK = :pkval", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":pkval": `USER#${userId}` }) })
                .resolvesOnce({ Items: [...userRoles, ...userPerms] }); // Combine results for single PK query
            // Mock BatchWrite to succeed
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForUser(userId);
            // Verify Query was called correctly
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, {
                KeyConditionExpression: "PK = :pkval",
                ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":pkval": `USER#${userId}` }),
                ProjectionExpression: "PK, SK",
            });
            // Verify BatchWrite was called with correct DeleteRequests
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } },
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `PERM#${permName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for user ID: ${userId}. Deleted 2 items.`));
        }));
        it('removeAllAssignmentsForGroup should query PK and batch delete', () => __awaiter(void 0, void 0, void 0, function* () {
            // Mock Query for GROUP# PK (only finds roles assigned to group)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":pkval": `GROUP#${groupName}`, ":skprefix": "ROLE#" }) })
                .resolves({ Items: groupRoles });
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForGroup(groupName);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.QueryCommand, { ProjectionExpression: "PK, SK" });
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.BatchWriteItemCommand, {
                RequestItems: { [tableName]: [{ DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` }) } }] }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for group: ${groupName}. Deleted 1 items.`));
        }));
        it('removeAllAssignmentsForRole should query PK and GSI, then batch delete', () => __awaiter(void 0, void 0, void 0, function* () {
            // Mock Query for ROLE# PK (finds assigned permissions)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { KeyConditionExpression: "PK = :pkval AND begins_with(SK, :skprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":pkval": `ROLE#${roleName}`, ":skprefix": "PERM#" }) })
                .resolves({ Items: rolePerms });
            // Mock Query for GSI lookup (finds groups with this role)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":skval": `ROLE#${roleName}`, ":pkprefix": "GROUP#" }) })
                .resolves({ Items: groupRoles }); // Group assignment item
            // Mock Query for GSI lookup (finds users with this role)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":skval": `ROLE#${roleName}`, ":pkprefix": "USER#" }) })
                .resolves({ Items: usersWithRole }); // User assignment item
            // Mock BatchWrite
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForRole(roleName);
            // Verify all 3 queries were made
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.QueryCommand, 3);
            // Verify BatchWrite payload
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` }) } },
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `GROUP#${groupName}`, SK: `ROLE#${roleName}` }) } },
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for role: ${roleName}. Deleted 3 assignment items.`));
        }));
        it('removeAllAssignmentsForPermission should query GSI and batch delete', () => __awaiter(void 0, void 0, void 0, function* () {
            // Mock Query for GSI lookup (finds roles with this perm)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":skval": `PERM#${permName}`, ":pkprefix": "ROLE#" }) })
                .resolves({ Items: rolesWithPerm });
            // Mock Query for GSI lookup (finds users with this perm)
            ddbMock.on(lib_dynamodb_1.QueryCommand, { IndexName: GSI1_NAME, KeyConditionExpression: "SK = :skval AND begins_with(PK, :pkprefix)", ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":skval": `PERM#${permName}`, ":pkprefix": "USER#" }) })
                .resolves({ Items: userPerms });
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForPermission(permName);
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.QueryCommand, 2);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.BatchWriteItemCommand, {
                RequestItems: {
                    [tableName]: expect.arrayContaining([
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `ROLE#${roleName}`, SK: `PERM#${permName}` }) } },
                        { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `PERM#${permName}` }) } },
                    ])
                }
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for permission: ${permName}. Deleted 2 assignment items.`));
        }));
        it('should handle empty results during cleanup queries', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: [] }); // All queries return empty
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForRole(roleName); // Example call
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.QueryCommand, 3); // Queries still run
            expect(ddbMock).not.toHaveReceivedCommand(client_dynamodb_1.BatchWriteItemCommand); // No batch write needed
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for role: ${roleName}. Deleted 0 assignment items.`));
        }));
        it('should handle unprocessed items during batch delete', () => __awaiter(void 0, void 0, void 0, function* () {
            const itemsToDelete = [(0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
            const unprocessedKey = { DeleteRequest: { Key: (0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` }) } };
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: itemsToDelete });
            // First BatchWrite returns unprocessed items, second succeeds
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand)
                .resolvesOnce({ UnprocessedItems: { [tableName]: [unprocessedKey] } })
                .resolvesOnce({ UnprocessedItems: {} });
            yield repository.removeAllAssignmentsForUser(userId);
            expect(ddbMock).toHaveReceivedCommandTimes(client_dynamodb_1.BatchWriteItemCommand, 2); // Initial + Retry
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Retrying 1 unprocessed delete items...`));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Completed assignment cleanup for user ID: ${userId}. Deleted 1 items.`));
        }));
        it('should throw DatabaseError if query fails during cleanup', () => __awaiter(void 0, void 0, void 0, function* () {
            const queryError = new Error('Query failed during cleanup');
            ddbMock.on(lib_dynamodb_1.QueryCommand).rejects(queryError);
            yield expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(/Failed during query/);
            expect(ddbMock).not.toHaveReceivedCommand(client_dynamodb_1.BatchWriteItemCommand);
        }));
        it('should throw DatabaseError if batch delete fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const itemsToDelete = [(0, util_dynamodb_1.marshall)({ PK: `USER#${userId}`, SK: `ROLE#${roleName}` })];
            const batchError = new Error('BatchWrite failed');
            ddbMock.on(lib_dynamodb_1.QueryCommand).resolves({ Items: itemsToDelete });
            ddbMock.on(client_dynamodb_1.BatchWriteItemCommand).rejects(batchError);
            yield expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.removeAllAssignmentsForUser(userId)).rejects.toThrow(/Failed during batch delete/);
        }));
    });
});
