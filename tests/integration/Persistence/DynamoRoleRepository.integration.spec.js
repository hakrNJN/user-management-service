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
// tests/integration/DynamoRoleRepository.integration.spec.ts
require("reflect-metadata"); // Required for tsyringe
const container_1 = require("../../../src/container"); // Use actual container
const Role_1 = require("../../../src/domain/entities/Role");
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
const dynamodb_helper_1 = require("../../helpers/dynamodb.helper"); // Import test table name
// Note: We use the real repository implementation injected via the container
describe('DynamoRoleRepository Integration Tests', () => {
    let roleRepository;
    let configService; // To verify table name setup
    // Ensure the test table name is set for the container's config service
    // This assumes your EnvironmentConfigService reads process.env correctly during test setup
    beforeAll(() => {
        // Ensure the environment variable used by the actual ConfigService is set
        // This should match the variable checked within EnvironmentConfigService
        process.env.AUTHZ_TABLE_NAME = dynamodb_helper_1.TEST_TABLE_NAME;
        // It might be necessary to re-resolve or ensure the container picks up the env var
        // Or directly register the test table name for the test environment if needed
        configService = container_1.container.resolve(types_1.TYPES.ConfigService);
        expect(configService.getOrThrow('AUTHZ_TABLE_NAME')).toBe(dynamodb_helper_1.TEST_TABLE_NAME);
        roleRepository = container_1.container.resolve(types_1.TYPES.RoleRepository);
    });
    // Clear table items before each test
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        // Implement clearTestTable helper or rely on delete/create in before/afterAll
        // For now, we assume beforeAll/afterAll handles table state
    }));
    const testRole1 = new Role_1.Role('int-test-role-1', 'Integration Test Role 1');
    const testRole2 = new Role_1.Role('int-test-role-2', 'Integration Test Role 2');
    it('should create a new role', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect(roleRepository.create(testRole1)).resolves.not.toThrow();
        // Verify by fetching
        const found = yield roleRepository.findByName(testRole1.roleName);
        expect(found).toBeInstanceOf(Role_1.Role);
        expect(found === null || found === void 0 ? void 0 : found.roleName).toBe(testRole1.roleName);
        expect(found === null || found === void 0 ? void 0 : found.description).toBe(testRole1.description);
        expect(found === null || found === void 0 ? void 0 : found.createdAt).toBeInstanceOf(Date);
        expect(found === null || found === void 0 ? void 0 : found.updatedAt).toBeInstanceOf(Date);
    }));
    it('should throw RoleExistsError when creating a duplicate role name', () => __awaiter(void 0, void 0, void 0, function* () {
        yield roleRepository.create(testRole1); // Create first time
        // Attempt to create again
        yield expect(roleRepository.create(testRole1)).rejects.toThrow(BaseError_1.BaseError);
        yield expect(roleRepository.create(testRole1)).rejects.toHaveProperty('name', 'RoleExistsError');
    }));
    it('should find an existing role by name', () => __awaiter(void 0, void 0, void 0, function* () {
        yield roleRepository.create(testRole1);
        const found = yield roleRepository.findByName(testRole1.roleName);
        expect(found).toBeInstanceOf(Role_1.Role);
        expect(found === null || found === void 0 ? void 0 : found.roleName).toBe(testRole1.roleName);
    }));
    it('should return null when finding a non-existent role', () => __awaiter(void 0, void 0, void 0, function* () {
        const found = yield roleRepository.findByName('non-existent-role');
        expect(found).toBeNull();
    }));
    it('should update an existing role', () => __awaiter(void 0, void 0, void 0, function* () {
        yield roleRepository.create(testRole1);
        const updates = { description: 'Updated Description' };
        const updatedRole = yield roleRepository.update(testRole1.roleName, updates);
        expect(updatedRole).toBeInstanceOf(Role_1.Role);
        expect(updatedRole === null || updatedRole === void 0 ? void 0 : updatedRole.description).toBe('Updated Description');
        expect(updatedRole === null || updatedRole === void 0 ? void 0 : updatedRole.updatedAt).not.toEqual(testRole1.updatedAt); // UpdatedAt should change
        // Verify by fetching again
        const found = yield roleRepository.findByName(testRole1.roleName);
        expect(found === null || found === void 0 ? void 0 : found.description).toBe('Updated Description');
    }));
    it('should return null when updating a non-existent role', () => __awaiter(void 0, void 0, void 0, function* () {
        const updates = { description: 'Updated Description' };
        const updatedRole = yield roleRepository.update('non-existent-role', updates);
        expect(updatedRole).toBeNull();
    }));
    it('should delete an existing role and return true', () => __awaiter(void 0, void 0, void 0, function* () {
        yield roleRepository.create(testRole1);
        const deleted = yield roleRepository.delete(testRole1.roleName);
        expect(deleted).toBe(true);
        // Verify deletion
        const found = yield roleRepository.findByName(testRole1.roleName);
        expect(found).toBeNull();
    }));
    it('should return false when deleting a non-existent role', () => __awaiter(void 0, void 0, void 0, function* () {
        const deleted = yield roleRepository.delete('non-existent-role');
        expect(deleted).toBe(false);
    }));
    it('should list created roles (using Scan - may be partial)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield roleRepository.create(testRole1);
        yield roleRepository.create(testRole2);
        // Basic list test (Scan might not be reliable for full verification without pagination)
        const result = yield roleRepository.list({ limit: 5 });
        expect(result.items.length).toBeGreaterThanOrEqual(2); // Should find at least the two we created
        expect(result.items.some(r => r.roleName === testRole1.roleName)).toBe(true);
        expect(result.items.some(r => r.roleName === testRole2.roleName)).toBe(true);
        // Add pagination tests if needed
    }));
});
