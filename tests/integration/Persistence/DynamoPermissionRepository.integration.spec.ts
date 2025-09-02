import 'reflect-metadata';
import { IPermissionRepository } from '../../../src/application/interfaces/IPermissionRepository';
import { container } from 'tsyringe';
import { Permission } from '../../../src/domain/entities/Permission';
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { clearTestTable } from '../../helpers/dynamodb.helper';
import { mockConfigService } from '../../mocks/config.mock';
import { loggerMock } from '../../mocks/logger.mock';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBProvider } from '../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { ScalarAttributeType, KeyType } from "@aws-sdk/client-dynamodb";
import { DynamoPermissionRepository } from '../../../src/infrastructure/persistence/dynamodb/DynamoPermissionRepository';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';

describe('DynamoPermissionRepository Integration Tests', () => {
    let permissionRepository: IPermissionRepository;
    const tableName = 'TestPermissions';

    // Define the schema for the Permission table
    const permissionTableKeySchema = [
        { AttributeName: "PK", KeyType: KeyType.HASH },
        { AttributeName: "SK", KeyType: KeyType.RANGE }
    ];

    beforeAll(() => {
        // Register the real repository implementation in our test container
        container.register<IPermissionRepository>(TYPES.PermissionRepository, {
            useClass: DynamoPermissionRepository,
        });

        // Register mocks for dependencies
        container.register(TYPES.ConfigService, { useValue: mockConfigService });
        container.register(TYPES.Logger, { useValue: loggerMock });

        // Register the DynamoDBClient and DynamoDBProvider
        container.register(DynamoDBClient, {
            useFactory: () => {
                return new DynamoDBClient({
                    region: "ap-south-1",
                });
            },
        });

        container.register(TYPES.DynamoDBProvider, {
            useFactory: (c) => {
                const client = c.resolve(DynamoDBClient);
                const config = c.resolve<IConfigService>(TYPES.ConfigService);
                // Temporarily override the AUTHZ_TABLE_NAME for this specific test
                (config.getOrThrow as jest.Mock).mockImplementation((key: string) => {
                    if (key === 'AUTHZ_TABLE_NAME') return tableName;
                    // Fallback to original mock implementation for other keys
                    return mockConfigService.getOrThrow(key);
                });
                return new DynamoDBProvider(config, tableName, client);
            },
        });

        permissionRepository = container.resolve<IPermissionRepository>(TYPES.PermissionRepository);
    });

    beforeEach(async () => {
        await clearTestTable(tableName, permissionTableKeySchema);
    });

    const testPerm1 = new Permission('doc:read', 'Read documents');
    const testPerm2 = new Permission('doc:write', 'Write documents');

    it('should create a new permission', async () => {
        await expect(permissionRepository.create(testPerm1)).resolves.not.toThrow();
        const found = await permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeInstanceOf(Permission);
        expect(found?.permissionName).toBe(testPerm1.permissionName);
    });

    it('should throw PermissionExistsError when creating a duplicate permission name', async () => {
        await permissionRepository.create(testPerm1);
        await expect(permissionRepository.create(testPerm1)).rejects.toThrow(BaseError);
        await expect(permissionRepository.create(testPerm1)).rejects.toHaveProperty('name', 'PermissionExistsError');
    });

    it('should find an existing permission by name', async () => {
        await permissionRepository.create(testPerm1);
        const found = await permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeInstanceOf(Permission);
        expect(found?.permissionName).toBe(testPerm1.permissionName);
    });

    it('should return null when finding a non-existent permission', async () => {
        const found = await permissionRepository.findByName('perm:nonexistent');
        expect(found).toBeNull();
    });

    it('should update an existing permission', async () => {
        await permissionRepository.create(testPerm1);
        const updates = { description: 'Read ALL documents now' };
        const updatedPerm = await permissionRepository.update(testPerm1.permissionName, updates);

        expect(updatedPerm).toBeInstanceOf(Permission);
        expect(updatedPerm?.description).toBe(updates.description);

        const found = await permissionRepository.findByName(testPerm1.permissionName);
        expect(found?.description).toBe(updates.description);
    });

    it('should return null when updating a non-existent permission', async () => {
        const updatedPerm = await permissionRepository.update('perm:nonexistent', { description: 'abc' });
        expect(updatedPerm).toBeNull();
    });

    it('should delete an existing permission and return true', async () => {
        await permissionRepository.create(testPerm1);
        const deleted = await permissionRepository.delete(testPerm1.permissionName);
        expect(deleted).toBe(true);
        const found = await permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeNull();
    });

     it('should return false when deleting a non-existent permission', async () => {
        const deleted = await permissionRepository.delete('perm:nonexistent');
        expect(deleted).toBe(false);
    });

    it('should list created permissions (using Scan)', async () => {
        await permissionRepository.create(testPerm1);
        await permissionRepository.create(testPerm2);

        const result = await permissionRepository.list({ limit: 5 });
        expect(result.items.length).toBeGreaterThanOrEqual(2);
        expect(result.items.some((p: Permission) => p.permissionName === testPerm1.permissionName)).toBe(true);
        expect(result.items.some((p: Permission) => p.permissionName === testPerm2.permissionName)).toBe(true);
    });
});