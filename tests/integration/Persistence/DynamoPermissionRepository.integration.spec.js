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
// tests/integration/DynamoPermissionRepository.integration.spec.ts
require("reflect-metadata");
const container_1 = require("../../../src/container");
const Permission_1 = require("../../../src/domain/entities/Permission");
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
const dynamodb_helper_1 = require("../../helpers/dynamodb.helper");
describe('DynamoPermissionRepository Integration Tests', () => {
    let permissionRepository;
    beforeAll(() => {
        process.env.AUTHZ_TABLE_NAME = dynamodb_helper_1.TEST_TABLE_NAME;
        permissionRepository = container_1.container.resolve(types_1.TYPES.PermissionRepository);
    });
    // Add beforeEach/afterEach for item cleanup if needed
    const testPerm1 = new Permission_1.Permission('doc:read', 'Read documents');
    const testPerm2 = new Permission_1.Permission('doc:write', 'Write documents');
    it('should create a new permission', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect(permissionRepository.create(testPerm1)).resolves.not.toThrow();
        const found = yield permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeInstanceOf(Permission_1.Permission);
        expect(found === null || found === void 0 ? void 0 : found.permissionName).toBe(testPerm1.permissionName);
    }));
    it('should throw PermissionExistsError when creating a duplicate permission name', () => __awaiter(void 0, void 0, void 0, function* () {
        yield permissionRepository.create(testPerm1);
        yield expect(permissionRepository.create(testPerm1)).rejects.toThrow(BaseError_1.BaseError);
        yield expect(permissionRepository.create(testPerm1)).rejects.toHaveProperty('name', 'PermissionExistsError');
    }));
    it('should find an existing permission by name', () => __awaiter(void 0, void 0, void 0, function* () {
        yield permissionRepository.create(testPerm1);
        const found = yield permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeInstanceOf(Permission_1.Permission);
        expect(found === null || found === void 0 ? void 0 : found.permissionName).toBe(testPerm1.permissionName);
    }));
    it('should return null when finding a non-existent permission', () => __awaiter(void 0, void 0, void 0, function* () {
        const found = yield permissionRepository.findByName('perm:nonexistent');
        expect(found).toBeNull();
    }));
    it('should update an existing permission', () => __awaiter(void 0, void 0, void 0, function* () {
        yield permissionRepository.create(testPerm1);
        const updates = { description: 'Read ALL documents now' };
        const updatedPerm = yield permissionRepository.update(testPerm1.permissionName, updates);
        expect(updatedPerm).toBeInstanceOf(Permission_1.Permission);
        expect(updatedPerm === null || updatedPerm === void 0 ? void 0 : updatedPerm.description).toBe(updates.description);
        const found = yield permissionRepository.findByName(testPerm1.permissionName);
        expect(found === null || found === void 0 ? void 0 : found.description).toBe(updates.description);
    }));
    it('should return null when updating a non-existent permission', () => __awaiter(void 0, void 0, void 0, function* () {
        const updatedPerm = yield permissionRepository.update('perm:nonexistent', { description: 'abc' });
        expect(updatedPerm).toBeNull();
    }));
    it('should delete an existing permission and return true', () => __awaiter(void 0, void 0, void 0, function* () {
        yield permissionRepository.create(testPerm1);
        const deleted = yield permissionRepository.delete(testPerm1.permissionName);
        expect(deleted).toBe(true);
        const found = yield permissionRepository.findByName(testPerm1.permissionName);
        expect(found).toBeNull();
    }));
    it('should return false when deleting a non-existent permission', () => __awaiter(void 0, void 0, void 0, function* () {
        const deleted = yield permissionRepository.delete('perm:nonexistent');
        expect(deleted).toBe(false);
    }));
    it('should list created permissions (using Scan)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield permissionRepository.create(testPerm1);
        yield permissionRepository.create(testPerm2);
        const result = yield permissionRepository.list({ limit: 5 });
        expect(result.items.length).toBeGreaterThanOrEqual(2);
        expect(result.items.some(p => p.permissionName === testPerm1.permissionName)).toBe(true);
        expect(result.items.some(p => p.permissionName === testPerm2.permissionName)).toBe(true);
    }));
});
