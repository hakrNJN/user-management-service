// tests/integration/DynamoRoleRepository.integration.spec.ts
import 'reflect-metadata'; // Required for tsyringe
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { IRoleRepository } from '../../../src/application/interfaces/IRoleRepository';
import { container } from 'tsyringe'; // Use actual container
import { Role } from '../../../src/domain/entities/Role';
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { createTestTable, deleteTestTable, clearTestTable, destroyDynamoDBClient, TEST_TABLE_NAME, setupIntegrationTest } from '../../helpers/dynamodb.helper'; // Import test table name
// Note: We use the real repository implementation injected via the container

describe('DynamoRoleRepository Integration Tests', () => {
    let roleRepository: IRoleRepository;
    let configService: IConfigService; // To verify table name setup

    // Ensure the test table name is set for the container's config service
    // This assumes your EnvironmentConfigService reads process.env correctly during test setup
    beforeAll(async () => {
        setupIntegrationTest(); // Setup container with test config
        configService = container.resolve<IConfigService>(TYPES.ConfigService);
        expect(configService.getOrThrow('AUTHZ_TABLE_NAME')).toBe(TEST_TABLE_NAME);

        roleRepository = container.resolve<IRoleRepository>(TYPES.RoleRepository);
        await createTestTable(); // Create the test table
    });

    afterAll(async () => {
        await deleteTestTable(); // Clean up the test table
        destroyDynamoDBClient(); // Destroy the DynamoDB client
    });

    // Clear table items before each test
    beforeEach(async () => {
        await clearTestTable(); // Clear table before each test
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
        expect(found?.createdAt).toBeInstanceOf(Date);
        expect(found?.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw RoleExistsError when creating a duplicate role name', async () => {
        await roleRepository.create(testRole1); // Create first time
        // Attempt to create again
        await expect(roleRepository.create(testRole1)).rejects.toThrow(BaseError);
        await expect(roleRepository.create(testRole1)).rejects.toHaveProperty('name', 'RoleExistsError');
    });

    it('should find an existing role by name', async () => {
        await roleRepository.create(testRole1);
        const found = await roleRepository.findByName(testRole1.roleName);
        expect(found).toBeInstanceOf(Role);
        expect(found?.roleName).toBe(testRole1.roleName);
    });

    it('should return null when finding a non-existent role', async () => {
        const found = await roleRepository.findByName('non-existent-role');
        expect(found).toBeNull();
    });

    it('should update an existing role', async () => {
        await roleRepository.create(testRole1);
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
        await roleRepository.create(testRole1);
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
        await roleRepository.create(testRole1);
        await roleRepository.create(testRole2);

        // Basic list test (Scan might not be reliable for full verification without pagination)
        const result = await roleRepository.list({ limit: 5 });
        expect(result.items.length).toBeGreaterThanOrEqual(2); // Should find at least the two we created
        expect(result.items.some((r: Role) => r.roleName === testRole1.roleName)).toBe(true);
        expect(result.items.some((r: Role) => r.roleName === testRole2.roleName)).toBe(true);
        // Add pagination tests if needed
    });
});