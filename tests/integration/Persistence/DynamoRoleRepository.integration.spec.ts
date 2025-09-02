import 'reflect-metadata'; // Required for tsyringe
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { IRoleRepository } from '../../../src/application/interfaces/IRoleRepository';
import { Role } from '../../../src/domain/entities/Role';
import { TYPES } from '../../../src/shared/constants/types';
import { clearTestTable } from '../../helpers/dynamodb.helper';
import { persistenceContainer } from '../../helpers/persistence.helper';
import { DynamoRoleRepository } from '../../../src/infrastructure/persistence/dynamodb/DynamoRoleRepository';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBProvider } from '../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { mockConfigService } from '../../mocks/config.mock';
import { loggerMock } from '../../mocks/logger.mock';

describe('DynamoRoleRepository Integration Tests - Minimal', () => {
    let roleRepository: IRoleRepository;
    let configService: IConfigService;
    let tableName: string = 'TestRoles';

    const tableKeySchema = [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE },
    ];

    beforeAll(() => {
        // Resolve configService first to apply mockImplementation
        configService = persistenceContainer.resolve<IConfigService>(TYPES.ConfigService);

        // Temporarily override the AUTHZ_TABLE_NAME for this specific test
        (configService.getOrThrow as jest.Mock).mockImplementation((key: string) => {
            if (key === 'AUTHZ_TABLE_NAME') return tableName;
            // Fallback to original mock implementation for other keys
            return mockConfigService.getOrThrow(key);
        });

        // Register the real repository implementation in our test container
        persistenceContainer.register<IRoleRepository>(TYPES.RoleRepository, {
            useClass: DynamoRoleRepository,
        });

        // Register the DynamoDBClient
        persistenceContainer.register(DynamoDBClient, {
            useFactory: () => {
                return new DynamoDBClient({
                    region: "ap-south-1",
                });
            },
        });

        // Resolve roleRepository after all registrations
        roleRepository = persistenceContainer.resolve<IRoleRepository>(TYPES.RoleRepository);
    });

    beforeEach(async () => {
        await clearTestTable(tableName, tableKeySchema);
    });

    const testRole1 = new Role('int-test-role-1', 'Integration Test Role 1');
    const testRole2 = new Role('int-test-role-2', 'Integration Test Role 2');

    it('should create a new role', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();

        // Verify by fetching
        const found = await roleRepository.findByName(testRole1.roleName);
        expect(found).toBeInstanceOf(Role);
        expect(found?.roleName).toBe(testRole1.roleName);
        expect(found?.description).toBe(testRole1.description);
    });

    it('should throw RoleExistsError when creating a duplicate role name', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        // Attempt to create again
        await expect(roleRepository.create(testRole1)).rejects.toThrow(BaseError);
        await expect(roleRepository.create(testRole1)).rejects.toHaveProperty('name', 'RoleExistsError');
    });

    it('should find an existing role by name', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        const found = await roleRepository.findByName(testRole1.roleName);
        expect(found).toBeInstanceOf(Role);
        expect(found?.roleName).toBe(testRole1.roleName);
    });

    it('should return null when finding a non-existent role', async () => {
        const found = await roleRepository.findByName('non-existent-role');
        expect(found).toBeNull();
    });

    it('should update an existing role', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        const updates = { description: 'Updated Description' };
        const updatedRole = await roleRepository.update(testRole1.roleName, updates);

        expect(updatedRole).toBeInstanceOf(Role);
        expect(updatedRole?.description).toBe('Updated Description');
        expect(updatedRole?.updatedAt).not.toEqual(testRole1.updatedAt); // UpdatedAt should change

        // Verify by fetching again
        const found = await roleRepository.findByName(testRole1.roleName);
        expect(found?.description).toBe('Updated Description');
    });

    it('should return null when updating a non-existent role', async () => {
        const updates = { description: 'Updated Description' };
        const updatedRole = await roleRepository.update('non-existent-role', updates);
        expect(updatedRole).toBeNull();
    });

    it('should delete an existing role and return true', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        const deleted = await roleRepository.delete(testRole1.roleName);
        expect(deleted).toBe(true);

        // Verify deletion
        const found = await roleRepository.findByName(testRole1.roleName);
        expect(found).toBeNull();
    });

    it('should return false when deleting a non-existent role', async () => {
        const deleted = await roleRepository.delete('non-existent-role');
        expect(deleted).toBe(false);
    });

    it('should list created roles (using Scan - may be partial)', async () => {
        await expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        await expect(roleRepository.create(testRole2)).resolves.not.toThrow();

        // Basic list test (Scan might not be reliable for full verification without pagination)
        const result = await roleRepository.list({ limit: 5 });
        expect(result.items.length).toBeGreaterThanOrEqual(2); // Should find at least the two we created
        expect(result.items.some((r: Role) => r.roleName === testRole1.roleName)).toBe(true);
        expect(result.items.some((r: Role) => r.roleName === testRole2.roleName)).toBe(true);
        // Add pagination tests if needed
    });
});