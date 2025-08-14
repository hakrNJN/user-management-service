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
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock"); // Great library for mocking SDK v3 clients
require("aws-sdk-client-mock-jest"); // Extends jest expect with aws-sdk assertions
const Role_1 = require("../../../../src/domain/entities/Role");
const dynamodb_client_1 = require("../../../../src/infrastructure/persistence/dynamodb/dynamodb.client");
const DynamoRoleRepository_1 = require("../../../../src/infrastructure/persistence/dynamodb/DynamoRoleRepository");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../mocks/config.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
// Mock the DocumentClient using aws-sdk-client-mock
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('DynamoRoleRepository', () => {
    let repository;
    let configService;
    let logger;
    const tableName = 'test-authz-table';
    const testRoleName = 'test-admin';
    beforeEach(() => {
        ddbMock.reset(); // Reset DynamoDB mock before each test
        jest.clearAllMocks(); // Reset other mocks
        // Use fresh mocks
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        configService.getOrThrow.mockReturnValue(tableName); // Mock table name
        // Mock the provider - aws-sdk-client-mock handles the client instance
        const mockProvider = new dynamodb_client_1.DynamoDBProvider(configService);
        repository = new DynamoRoleRepository_1.DynamoRoleRepository(configService, logger, mockProvider);
    });
    // --- Test mapToRole directly ---
    describe('mapToRole', () => {
        it('should correctly map a valid DynamoDB item to a Role entity', () => {
            const item = {
                PK: `ROLE#${testRoleName}`,
                SK: `ROLE#${testRoleName}`,
                EntityType: 'Role',
                roleName: testRoleName,
                description: 'Test Role Desc',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            // Access private method for testing (use with caution, alternative is to rely on findByName tests)
            const role = repository.mapToRole(item);
            expect(role).toBeInstanceOf(Role_1.Role);
            expect(role.roleName).toBe(testRoleName);
            expect(role.description).toBe('Test Role Desc');
            expect(role.createdAt).toBeInstanceOf(Date);
        });
        it('should throw InvalidDataError if roleName is missing', () => {
            const item = {
                PK: `ROLE#${testRoleName}`,
                SK: `ROLE#${testRoleName}`,
                EntityType: 'Role',
                // roleName: testRoleName, // MISSING
                description: 'Test Role Desc',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            expect(() => repository.mapToRole(item))
                .toThrow(new BaseError_1.BaseError('InvalidDataError', 500, 'Invalid role data retrieved from database.', false));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Role item structure'), expect.any(Object));
        });
    });
    // --- Test create ---
    describe('create', () => {
        const role = new Role_1.Role(testRoleName, 'Test Description');
        it('should send PutCommand with correct parameters and succeed', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({}); // Mock successful Put
            yield repository.create(role);
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.PutCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: tableName,
                Item: expect.objectContaining({
                    PK: `ROLE#${testRoleName}`,
                    SK: `ROLE#${testRoleName}`,
                    EntityType: 'Role',
                    roleName: testRoleName,
                    description: 'Test Description',
                    createdAt: expect.any(String),
                    updatedAt: expect.any(String),
                }),
                ConditionExpression: 'attribute_not_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Role created successfully: ${testRoleName}`);
        }));
        it('should throw RoleExistsError if ConditionalCheckFailedException occurs', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("ConditionalCheckFailed"); // Simulate SDK v3 error
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(lib_dynamodb_1.PutCommand).rejects(error);
            yield expect(repository.create(role)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.create(role)).rejects.toHaveProperty('name', 'RoleExistsError');
            yield expect(repository.create(role)).rejects.toHaveProperty('statusCode', 409);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to create role, already exists: ${testRoleName}`);
        }));
        it('should throw DatabaseError for other DynamoDB errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Something went wrong");
            ddbMock.on(lib_dynamodb_1.PutCommand).rejects(error);
            yield expect(repository.create(role)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.create(role)).rejects.toHaveProperty('name', 'DatabaseError');
            yield expect(repository.create(role)).rejects.toHaveProperty('statusCode', 500);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error creating role ${testRoleName}`), error);
        }));
    });
    // --- Test findByName ---
    describe('findByName', () => {
        it('should return the Role if found', () => __awaiter(void 0, void 0, void 0, function* () {
            const item = {
                PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}`, EntityType: 'Role',
                roleName: testRoleName, description: 'Found Role',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: item });
            const result = yield repository.findByName(testRoleName);
            expect(result).toBeInstanceOf(Role_1.Role);
            expect(result === null || result === void 0 ? void 0 : result.roleName).toBe(testRoleName);
            expect(result === null || result === void 0 ? void 0 : result.description).toBe('Found Role');
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.GetCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.GetCommand, {
                TableName: tableName,
                Key: { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` },
            });
        }));
        it('should return null if role not found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const result = yield repository.findByName(testRoleName);
            expect(result).toBeNull();
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.GetCommand, 1);
        }));
        it('should throw DatabaseError if mapToRole throws InvalidDataError', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidItem = { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` }; // Missing roleName
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: invalidItem });
            yield expect(repository.findByName(testRoleName)).rejects.toThrow(BaseError_1.BaseError);
            // Check the *final* error thrown by findByName
            yield expect(repository.findByName(testRoleName)).rejects.toHaveProperty('message', expect.stringContaining(`Invalid role data retrieved from database.`));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Role item structure retrieved from DynamoDB: missing or invalid roleName'), expect.any(Object));
        }));
        it('should throw DatabaseError on other SDK errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("SDK Get failed");
            ddbMock.on(lib_dynamodb_1.GetCommand).rejects(error);
            yield expect(repository.findByName(testRoleName)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.findByName(testRoleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding role ${testRoleName}`), error);
        }));
    });
    // --- Test list ---
    describe('list', () => {
        it('should return roles and lastEvaluatedKey using Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            const items = [
                { PK: `ROLE#role1`, SK: `ROLE#role1`, EntityType: 'Role', roleName: 'role1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                { PK: `ROLE#role2`, SK: `ROLE#role2`, EntityType: 'Role', roleName: 'role2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            ];
            const lastKey = { PK: 'ROLE#role2', SK: 'ROLE#role2' };
            ddbMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: items, LastEvaluatedKey: lastKey });
            const result = yield repository.list({ limit: 10 });
            expect(result.items).toHaveLength(2);
            expect(result.items[0]).toBeInstanceOf(Role_1.Role);
            expect(result.items[0].roleName).toBe('role1');
            expect(result.lastEvaluatedKey).toEqual(lastKey);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("using Scan operation"));
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type",
                ExpressionAttributeValues: { ":type": "Role" },
                Limit: 10,
                ExclusiveStartKey: undefined
            });
        }));
        it('should handle empty scan results', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [], LastEvaluatedKey: undefined });
            const result = yield repository.list();
            expect(result.items).toHaveLength(0);
            expect(result.lastEvaluatedKey).toBeUndefined();
        }));
        it('should skip invalid items during list', () => __awaiter(void 0, void 0, void 0, function* () {
            // Clear any previous mock states and logger calls
            jest.clearAllMocks();
            ddbMock.reset();
            const items = [
                { PK: `ROLE#role1`, SK: `ROLE#role1`, EntityType: 'Role', roleName: 'role1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                { PK: `ROLE#invalid`, SK: `ROLE#invalid`, EntityType: 'Role' /* missing roleName */ },
                { PK: `ROLE#role2`, SK: `ROLE#role2`, EntityType: 'Role', roleName: 'role2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            ];
            // Make sure the config mock is set again after reset
            configService.getOrThrow.mockReturnValue(tableName);
            // Set up the ScanCommand mock
            ddbMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: items, LastEvaluatedKey: undefined });
            // Call the list method
            const result = yield repository.list();
            // Assertions
            expect(result.items).toHaveLength(2); // Only valid items should be mapped
            expect(result.items.map(r => r.roleName)).toEqual(['role1', 'role2']);
            // Check that logger.error was called exactly once with the expected message
            expect(logger.error.mock.calls.filter(call => call[0].includes("Skipping invalid role item")).length).toBe(1);
            // Verify the specific error log we expect
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid role item"), expect.objectContaining({ itemPk: 'ROLE#invalid' }));
            // Ensure no general "Failed to list roles" error was logged
            expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('Failed to list roles'), expect.anything());
        }));
    });
    // --- Test delete ---
    describe('delete', () => {
        it('should return true on successful deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const result = yield repository.delete(testRoleName);
            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandTimes(lib_dynamodb_1.DeleteCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.DeleteCommand, {
                TableName: tableName,
                Key: { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` },
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Role deleted successfully: ${testRoleName}`);
        }));
        it('should return false if role not found for deletion (ConditionalCheckFailed)', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("ConditionalCheckFailed");
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(lib_dynamodb_1.DeleteCommand).rejects(error);
            const result = yield repository.delete(testRoleName);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete role, not found: ${testRoleName}`);
        }));
        it('should throw DatabaseError for other SDK delete errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("SDK Delete failed");
            ddbMock.on(lib_dynamodb_1.DeleteCommand).rejects(error);
            yield expect(repository.delete(testRoleName)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.delete(testRoleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error deleting role ${testRoleName}`), error);
        }));
    });
});
