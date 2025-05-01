// tests/unit/infrastructure/persistence/DynamoPermissionRepository.spec.ts

import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { Permission } from '../../../../src/domain/entities/Permission';
import { DynamoDBProvider } from '../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { DynamoPermissionRepository } from '../../../../src/infrastructure/persistence/dynamodb/DynamoPermissionRepository';
import { BaseError } from "../../../../src/shared/errors/BaseError";
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoPermissionRepository', () => {
    let repository: DynamoPermissionRepository;
    let configService: jest.Mocked<IConfigService>;
    let logger: jest.Mocked<ILogger>;
    const tableName = 'test-authz-table';
    const testPermName = 'user:read';

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();

        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        configService.getOrThrow.mockReturnValue(tableName);

        const mockProvider = new DynamoDBProvider(configService);
        repository = new DynamoPermissionRepository(configService, logger, mockProvider);
    });

    // --- Test mapToPermission ---
    describe('mapToPermission', () => {
        it('should correctly map a valid DynamoDB item to a Permission entity', () => {
            const item = {
                PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission',
                permissionName: testPermName, description: 'Read user data',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            const perm = (repository as any).mapToPermission(item);
            expect(perm).toBeInstanceOf(Permission);
            expect(perm.permissionName).toBe(testPermName);
            expect(perm.description).toBe('Read user data');
            expect(perm.createdAt).toBeInstanceOf(Date);
        });

        it('should throw InvalidDataError if permissionName is missing', () => {
            const item = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission' };
            expect(() => (repository as any).mapToPermission(item))
                .toThrow(new BaseError('InvalidDataError', 500, 'Invalid permission data retrieved from database.', false));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Permission item structure'), expect.any(Object));
        });
    });

    // --- Test create ---
    describe('create', () => {
        const permission = new Permission(testPermName, 'Test Description');

        it('should send PutCommand with correct parameters and succeed', async () => {
            ddbMock.on(PutCommand).resolves({});
            await repository.create(permission);

            expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
                TableName: tableName,
                Item: expect.objectContaining({
                    PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission',
                    permissionName: testPermName, description: 'Test Description',
                }),
                ConditionExpression: 'attribute_not_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Permission created successfully: ${testPermName}`);
        });

        it('should throw PermissionExistsError if ConditionalCheckFailedException occurs', async () => {
            const error = new Error("ConditionalCheckFailed") as any;
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(PutCommand).rejects(error);

            await expect(repository.create(permission)).rejects.toThrow(BaseError);
            await expect(repository.create(permission)).rejects.toHaveProperty('name', 'PermissionExistsError'); // Specific error defined in repo
            await expect(repository.create(permission)).rejects.toHaveProperty('statusCode', 409);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to create permission, already exists: ${testPermName}`);
        });

        // Add test for generic DatabaseError similar to Role repo
    });

    // --- Test findByName ---
    describe('findByName', () => {
        it('should return the Permission if found', async () => {
            const item = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission', permissionName: testPermName, description: 'Found Perm' };
            ddbMock.on(GetCommand).resolves({ Item: item });
            const result = await repository.findByName(testPermName);
            expect(result).toBeInstanceOf(Permission);
            expect(result?.permissionName).toBe(testPermName);
            expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` } });
        });

        it('should return null if permission not found', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });
            const result = await repository.findByName(testPermName);
            expect(result).toBeNull();
        });

        it('should throw DatabaseError if mapToPermission throws InvalidDataError', async () => {
            const invalidItem = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` }; // Missing perm name
            ddbMock.on(GetCommand).resolves({ Item: invalidItem });
            await expect(repository.findByName(testPermName)).rejects.toThrow(BaseError);
            await expect(repository.findByName(testPermName)).rejects.toHaveProperty('message', expect.stringContaining(`Invalid permission data retrieved from database.`));
        });

        // Add test for generic DatabaseError similar to Role repo
    });

    // --- Test list ---
    describe('list', () => {
        it('should return permissions and lastEvaluatedKey using Scan', async () => {
            const items = [
                { PK: `PERM#p1`, SK: `PERM#p1`, EntityType: 'Permission', permissionName: 'p1' },
                { PK: `PERM#p2`, SK: `PERM#p2`, EntityType: 'Permission', permissionName: 'p2' },
            ];
            const lastKey = { PK: 'PERM#p2', SK: 'PERM#p2' };
            ddbMock.on(ScanCommand).resolves({ Items: items, LastEvaluatedKey: lastKey });
            const result = await repository.list({ limit: 5 });
            expect(result.items).toHaveLength(2);
            expect(result.items[0].permissionName).toBe('p1');
            expect(result.lastEvaluatedKey).toEqual(lastKey);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("using Scan operation"));
            expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, { Limit: 5 });
        });

        // Add test for empty scan results
        // Add test for skipping invalid items (similar to Role repo)
        // Add test for passing startKey
    });

    // --- Test update ---
    describe('update', () => {
        // Placeholder implementation in repo used fetch/put
        // Test based on that (less ideal than UpdateCommand)
        const updates = { description: 'Updated Desc Perm' };

        it('should update the permission description via fetch/put', async () => {
            const existingItem = { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}`, EntityType: 'Permission', permissionName: testPermName, description: 'Old Desc', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            // 1. Mock findByName call (GetCommand)
            ddbMock.on(GetCommand).resolves({ Item: existingItem });
            // 2. Mock the subsequent PutCommand
            ddbMock.on(PutCommand).resolves({});

            const result = await repository.update(testPermName, updates);

            expect(result).toBeInstanceOf(Permission);
            expect(result?.description).toBe('Updated Desc Perm');
            // Check that Get was called first
            expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` } });
            // Check that Put was called with updated data
            expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
                TableName: tableName,
                Item: expect.objectContaining({
                    permissionName: testPermName,
                    description: 'Updated Desc Perm',
                    updatedAt: expect.any(String) // Should have been updated
                }),
            });
        });

        it('should return null if permission not found for update', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined }); // findByName returns null
            const result = await repository.update(testPermName, updates);
            expect(result).toBeNull();
            expect(ddbMock).not.toHaveReceivedCommand(PutCommand); // Put should not be called
        });

        // Add test for DatabaseError during Get or Put
    });

    // --- Test delete ---
    describe('delete', () => {
        it('should return true on successful deletion', async () => {
            ddbMock.on(DeleteCommand).resolves({});
            const result = await repository.delete(testPermName);
            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandWith(DeleteCommand, {
                Key: { PK: `PERM#${testPermName}`, SK: `PERM#${testPermName}` },
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Permission deleted successfully: ${testPermName}`);
        });

        it('should return false if permission not found for deletion', async () => {
            const error = new Error("ConditionalCheckFailed") as any;
            error.name = 'ConditionalCheckFailedException';
            ddbMock.on(DeleteCommand).rejects(error);
            const result = await repository.delete(testPermName);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete permission, not found: ${testPermName}`);
        });

        // Add test for generic DatabaseError
    });
});