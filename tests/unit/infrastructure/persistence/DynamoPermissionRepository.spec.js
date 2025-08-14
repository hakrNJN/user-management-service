"use strict";
// tests/unit/infrastructure/persistence/DynamoPermissionRepository.spec.ts
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
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
const Permission_1 = require("../../../../src/domain/entities/Permission");
const dynamodb_client_1 = require("../../../../src/infrastructure/persistence/dynamodb/dynamodb.client");
const DynamoPermissionRepository_1 = require("../../../../src/infrastructure/persistence/dynamodb/DynamoPermissionRepository");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../mocks/config.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('DynamoPermissionRepository', () => {
    let repository;
    let configService;
    let logger;
    const tableName = 'test-authz-table';
    const testPermName = 'user:read';
    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        configService.getOrThrow.mockReturnValue(tableName);
        const mockProvider = new dynamodb_client_1.DynamoDBProvider(configService);
        repository = new DynamoPermissionRepository_1.DynamoPermissionRepository(configService, logger, mockProvider);
    });
    // --- Test mapToPermission ---
    describe('mapToPermission', () => {
        it('should correctly map a valid DynamoDB item to a Permission entity', () => {
            const item = {
                PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission',
                permissionName: testPermName, description: 'Read user data',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            const perm = repository.mapToPermission(item);
            expect(perm).toBeInstanceOf(Permission_1.Permission);
            expect(perm.permissionName).toBe(testPermName);
            expect(perm.description).toBe('Read user data');
            expect(perm.createdAt).toBeInstanceOf(Date);
        });
        it('should throw InvalidDataError if permissionName is missing', () => {
            const item = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission' };
            expect(() => repository.mapToPermission(item))
                .toThrow(new BaseError_1.BaseError('InvalidDataError', 500, 'Invalid permission data retrieved from database.', false));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Permission item structure'), expect.any(Object));
        });
    });
    // --- Test create ---
    describe('create', () => {
        const permission = new Permission_1.Permission(testPermName, 'Test Description');
        it('should send PutCommand with correct parameters and succeed', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            yield repository.create(permission);
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.PutCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: tableName,
                Item: expect.objectContaining({
                    PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission',
                    permissionName: testPermName, description: 'Test Description',
                }),
                ConditionExpression: 'attribute_not_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Permission created successfully: ${testPermName}`);
        }));
        it('should throw PermissionExistsError if ConditionalCheckFailedException occurs', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("ConditionalCheckFailed");
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(lib_dynamodb_1.PutCommand).rejects(error);
            yield expect(repository.create(permission)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.create(permission)).rejects.toHaveProperty('name', 'PermissionExistsError'); // Specific error defined in repo
            yield expect(repository.create(permission)).rejects.toHaveProperty('statusCode', 409);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to create permission, already exists: ${testPermName}`);
        }));
        // Add test for generic DatabaseError similar to Role repo
    });
    // --- Test findByName ---
    describe('findByName', () => {
        it('should return the Permission if found', () => __awaiter(void 0, void 0, void 0, function* () {
            const item = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission', permissionName: testPermName, description: 'Found Perm' };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: item });
            const result = yield repository.findByName(testPermName);
            expect(result).toBeInstanceOf(Permission_1.Permission);
            expect(result === null || result === void 0 ? void 0 : result.permissionName).toBe(testPermName);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.GetCommand, { Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` } });
        }));
        it('should return null if permission not found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const result = yield repository.findByName(testPermName);
            expect(result).toBeNull();
        }));
        it('should throw DatabaseError if mapToPermission throws InvalidDataError', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidItem = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` }; // Missing perm name
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: invalidItem });
            yield expect(repository.findByName(testPermName)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.findByName(testPermName)).rejects.toHaveProperty('message', expect.stringContaining(`Invalid permission data retrieved from database.`));
        }));
        // Add test for generic DatabaseError similar to Role repo
    });
    // --- Test list ---
    describe('list', () => {
        it('should return permissions and lastEvaluatedKey using Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            const items = [
                { PK: `PERM#p1`, SK: `PERM#p1`, EntityType: 'Permission', permissionName: 'p1' },
                { PK: `PERM#p2`, SK: `PERM#p2`, EntityType: 'Permission', permissionName: 'p2' },
            ];
            const lastKey = { PK: 'PERM#p2', SK: 'PERM#p2' };
            ddbMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: items, LastEvaluatedKey: lastKey });
            const result = yield repository.list({ limit: 5 });
            expect(result.items).toHaveLength(2);
            expect(result.items[0].permissionName).toBe('p1');
            expect(result.lastEvaluatedKey).toEqual(lastKey);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("using Scan operation"));
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.ScanCommand, { Limit: 5 });
        }));
        // Add test for empty scan results
        // Add test for skipping invalid items (similar to Role repo)
        // Add test for passing startKey
    });
    // --- Test update ---
    describe('update', () => {
        // Placeholder implementation in repo used fetch/put
        // Test based on that (less ideal than UpdateCommand)
        const updates = { description: 'Updated Desc Perm' };
        it('should update the permission description via fetch/put', () => __awaiter(void 0, void 0, void 0, function* () {
            const existingItem = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission', permissionName: testPermName, description: 'Old Desc', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            // 1. Mock findByName call (GetCommand)
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: existingItem });
            // 2. Mock the subsequent PutCommand
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const result = yield repository.update(testPermName, updates);
            expect(result).toBeInstanceOf(Permission_1.Permission);
            expect(result === null || result === void 0 ? void 0 : result.description).toBe('Updated Desc Perm');
            // Check that Get was called first
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.GetCommand, { Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` } });
            // Check that Put was called with updated data
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: tableName,
                Item: expect.objectContaining({
                    permissionName: testPermName,
                    description: 'Updated Desc Perm',
                    updatedAt: expect.any(String) // Should have been updated
                }),
            });
        }));
        it('should return null if permission not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined }); // findByName returns null
            const result = yield repository.update(testPermName, updates);
            expect(result).toBeNull();
            expect(ddbMock).not.toHaveReceivedCommand(lib_dynamodb_1.PutCommand); // Put should not be called
        }));
        // Add test for DatabaseError during Get or Put
    });
    // --- Test delete ---
    describe('delete', () => {
        it('should return true on successful deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const result = yield repository.delete(testPermName);
            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.DeleteCommand, {
                Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` },
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Permission deleted successfully: ${testPermName}`);
        }));
        it('should return false if permission not found for deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("ConditionalCheckFailed");
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(lib_dynamodb_1.DeleteCommand).rejects(error);
            const result = yield repository.delete(testPermName);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete permission, not found: ${testPermName}`);
        }));
        // Add test for generic DatabaseError
    });
});
