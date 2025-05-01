import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from 'aws-sdk-client-mock'; // Great library for mocking SDK v3 clients
import 'aws-sdk-client-mock-jest'; // Extends jest expect with aws-sdk assertions

import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { Role } from '../../../../src/domain/entities/Role';
import { DynamoDBProvider } from '../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { DynamoRoleRepository } from '../../../../src/infrastructure/persistence/dynamodb/DynamoRoleRepository';
import { BaseError } from "../../../../src/shared/errors/BaseError";
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

// Mock the DocumentClient using aws-sdk-client-mock
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoRoleRepository', () => {
    let repository: DynamoRoleRepository;
    let configService: jest.Mocked<IConfigService>;
    let logger: jest.Mocked<ILogger>;
    const tableName = 'test-authz-table';
    const testRoleName = 'test-admin';

    beforeEach(() => {
        ddbMock.reset(); // Reset DynamoDB mock before each test
        jest.clearAllMocks(); // Reset other mocks

        // Use fresh mocks
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        configService.getOrThrow.mockReturnValue(tableName); // Mock table name

        // Mock the provider - aws-sdk-client-mock handles the client instance
        const mockProvider = new DynamoDBProvider(configService);
        repository = new DynamoRoleRepository(configService, logger, mockProvider);
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
            const role = (repository as any).mapToRole(item);
            expect(role).toBeInstanceOf(Role);
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
            expect(() => (repository as any).mapToRole(item))
                .toThrow(new BaseError('InvalidDataError', 500, 'Invalid role data retrieved from database.', false));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Role item structure'), expect.any(Object));
        });
    });

    // --- Test create ---
    describe('create', () => {
        const role = new Role(testRoleName, 'Test Description');

        it('should send PutCommand with correct parameters and succeed', async () => {
            ddbMock.on(PutCommand).resolves({}); // Mock successful Put

            await repository.create(role);

            expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
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
        });

        it('should throw RoleExistsError if ConditionalCheckFailedException occurs', async () => {
            const error = new Error("ConditionalCheckFailed") as any; // Simulate SDK v3 error
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(PutCommand).rejects(error);

            await expect(repository.create(role)).rejects.toThrow(BaseError);
            await expect(repository.create(role)).rejects.toHaveProperty('name', 'RoleExistsError');
            await expect(repository.create(role)).rejects.toHaveProperty('statusCode', 409);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to create role, already exists: ${testRoleName}`);
        });

        it('should throw DatabaseError for other DynamoDB errors', async () => {
            const error = new Error("Something went wrong");
            ddbMock.on(PutCommand).rejects(error);

            await expect(repository.create(role)).rejects.toThrow(BaseError);
            await expect(repository.create(role)).rejects.toHaveProperty('name', 'DatabaseError');
            await expect(repository.create(role)).rejects.toHaveProperty('statusCode', 500);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error creating role ${testRoleName}`), error);
        });
    });

    // --- Test findByName ---
    describe('findByName', () => {
        it('should return the Role if found', async () => {
            const item = {
                PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}`, EntityType: 'Role',
                roleName: testRoleName, description: 'Found Role',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            ddbMock.on(GetCommand).resolves({ Item: item });

            const result = await repository.findByName(testRoleName);

            expect(result).toBeInstanceOf(Role);
            expect(result?.roleName).toBe(testRoleName);
            expect(result?.description).toBe('Found Role');
            expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
                TableName: tableName,
                Key: { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` },
            });
        });

        it('should return null if role not found', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await repository.findByName(testRoleName);

            expect(result).toBeNull();
            expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
        });

        it('should throw DatabaseError if mapToRole throws InvalidDataError', async () => {
            const invalidItem = { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` }; // Missing roleName
            ddbMock.on(GetCommand).resolves({ Item: invalidItem });

            await expect(repository.findByName(testRoleName)).rejects.toThrow(BaseError);
            // Check the *final* error thrown by findByName
            await expect(repository.findByName(testRoleName)).rejects.toHaveProperty('message', expect.stringContaining(`Invalid role data retrieved from database.`));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Role item structure retrieved from DynamoDB: missing or invalid roleName'), expect.any(Object));
        });

        it('should throw DatabaseError on other SDK errors', async () => {
            const error = new Error("SDK Get failed");
            ddbMock.on(GetCommand).rejects(error);

            await expect(repository.findByName(testRoleName)).rejects.toThrow(BaseError);
            await expect(repository.findByName(testRoleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding role ${testRoleName}`), error);
        });
    });

    // --- Test list ---
    describe('list', () => {
        it('should return roles and lastEvaluatedKey using Scan', async () => {
            const items = [
                { PK: `ROLE#role1`, SK: `ROLE#role1`, EntityType: 'Role', roleName: 'role1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                { PK: `ROLE#role2`, SK: `ROLE#role2`, EntityType: 'Role', roleName: 'role2', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            ];
            const lastKey = { PK: 'ROLE#role2', SK: 'ROLE#role2' };
            ddbMock.on(ScanCommand).resolves({ Items: items, LastEvaluatedKey: lastKey });

            const result = await repository.list({ limit: 10 });

            expect(result.items).toHaveLength(2);
            expect(result.items[0]).toBeInstanceOf(Role);
            expect(result.items[0].roleName).toBe('role1');
            expect(result.lastEvaluatedKey).toEqual(lastKey);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("using Scan operation"));
            expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type",
                ExpressionAttributeValues: { ":type": "Role" },
                Limit: 10,
                ExclusiveStartKey: undefined
            });
        });

        it('should handle empty scan results', async () => {
            ddbMock.on(ScanCommand).resolves({ Items: [], LastEvaluatedKey: undefined });
            const result = await repository.list();
            expect(result.items).toHaveLength(0);
            expect(result.lastEvaluatedKey).toBeUndefined();
        });

        it('should skip invalid items during list', async () => {
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
            ddbMock.on(ScanCommand).resolves({ Items: items, LastEvaluatedKey: undefined });

            // Call the list method
            const result = await repository.list();

            // Assertions
            expect(result.items).toHaveLength(2); // Only valid items should be mapped
            expect(result.items.map(r => r.roleName)).toEqual(['role1', 'role2']);
            
            // Check that logger.error was called exactly once with the expected message
            expect(logger.error.mock.calls.filter(call => 
                call[0].includes("Skipping invalid role item")
            ).length).toBe(1);
            
            // Verify the specific error log we expect
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining("Skipping invalid role item"),
                expect.objectContaining({ itemPk: 'ROLE#invalid' })
            );
            
            // Ensure no general "Failed to list roles" error was logged
            expect(logger.error).not.toHaveBeenCalledWith(
                expect.stringContaining('Failed to list roles'), 
                expect.anything()
            );
        });
    });

    // --- Test delete ---
    describe('delete', () => {
        it('should return true on successful deletion', async () => {
            ddbMock.on(DeleteCommand).resolves({});
            const result = await repository.delete(testRoleName);

            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
                TableName: tableName,
                Key: { PK: `ROLE#${testRoleName}`, SK: `ROLE#${testRoleName}` },
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Role deleted successfully: ${testRoleName}`);
        });

        it('should return false if role not found for deletion (ConditionalCheckFailed)', async () => {
            const error = new Error("ConditionalCheckFailed") as any;
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(DeleteCommand).rejects(error);

            const result = await repository.delete(testRoleName);

            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete role, not found: ${testRoleName}`);
        });

        it('should throw DatabaseError for other SDK delete errors', async () => {
            const error = new Error("SDK Delete failed");
            ddbMock.on(DeleteCommand).rejects(error);

            await expect(repository.delete(testRoleName)).rejects.toThrow(BaseError);
            await expect(repository.delete(testRoleName)).rejects.toHaveProperty('name', 'DatabaseError');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error deleting role ${testRoleName}`), error);
        });
    });
});