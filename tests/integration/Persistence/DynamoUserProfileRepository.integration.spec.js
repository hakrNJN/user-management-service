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
// tests/integration/DynamoUserProfileRepository.integration.spec.ts
require("reflect-metadata");
const container_1 = require("../../../src/container");
const UserProfile_1 = require("../../../src/domain/entities/UserProfile"); // Assuming path
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
// Assuming a separate User Profile table or different PK/SK structure
// Adjust TEST_TABLE_NAME and PK/SK structure if using the same table
describe('DynamoUserProfileRepository Integration Tests', () => {
    let userProfileRepository;
    const USER_PROFILE_TABLE_NAME = process.env.USER_PROFILE_TABLE_NAME_TEST || 'user-profiles-test'; // Use separate table potentially
    // Assume table creation/deletion handled globally or via helpers for USER_PROFILE_TABLE_NAME
    beforeAll(() => {
        process.env.AUTHZ_TABLE_NAME = USER_PROFILE_TABLE_NAME; // If it uses same config key
        // OR: Register a specific table name for UserProfile repo if needed
        userProfileRepository = container_1.container.resolve(types_1.TYPES.UserProfileRepository); // Assuming registration exists
    });
    // Add beforeEach/afterEach for item cleanup
    const profile1 = new UserProfile_1.UserProfile('user-prof-1', 'profile1@test.com', 'Profile', 'One');
    const profile2 = new UserProfile_1.UserProfile('user-prof-2', 'profile2@test.com', 'Profile', 'Two');
    it('should save a new user profile', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
        const found = yield userProfileRepository.findById(profile1.userId);
        expect(found).toBeInstanceOf(UserProfile_1.UserProfile);
        expect(found === null || found === void 0 ? void 0 : found.userId).toBe(profile1.userId);
        expect(found === null || found === void 0 ? void 0 : found.email).toBe(profile1.email);
        expect(found === null || found === void 0 ? void 0 : found.firstName).toBe(profile1.firstName);
    }));
    it('should throw error when saving duplicate user profile (implement check in repo)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield userProfileRepository.save(profile1);
        // Assuming repo's save uses ConditionExpression: 'attribute_not_exists(PK)'
        yield expect(userProfileRepository.save(profile1)).rejects.toThrow(BaseError_1.BaseError); // Or specific DuplicateError
    }));
    it('should find an existing profile by ID', () => __awaiter(void 0, void 0, void 0, function* () {
        yield userProfileRepository.save(profile1);
        const found = yield userProfileRepository.findById(profile1.userId);
        expect(found).toBeInstanceOf(UserProfile_1.UserProfile);
        expect(found === null || found === void 0 ? void 0 : found.userId).toBe(profile1.userId);
    }));
    it('should return null when finding non-existent profile by ID', () => __awaiter(void 0, void 0, void 0, function* () {
        const found = yield userProfileRepository.findById('non-existent-user');
        expect(found).toBeNull();
    }));
    it('should find an existing profile by Email (assuming index exists)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield userProfileRepository.save(profile1);
        const found = yield userProfileRepository.findByEmail(profile1.email);
        expect(found).toBeInstanceOf(UserProfile_1.UserProfile);
        expect(found === null || found === void 0 ? void 0 : found.userId).toBe(profile1.userId);
        expect(found === null || found === void 0 ? void 0 : found.email).toBe(profile1.email);
    }));
    it('should return null when finding non-existent profile by Email', () => __awaiter(void 0, void 0, void 0, function* () {
        const found = yield userProfileRepository.findByEmail('nonexistent@test.com');
        expect(found).toBeNull();
    }));
    it('should update an existing profile', () => __awaiter(void 0, void 0, void 0, function* () {
        yield userProfileRepository.save(profile1);
        const updates = { firstName: 'UpdatedFirst', phoneNumber: '123456' };
        yield expect(userProfileRepository.update(profile1.userId, updates)).resolves.not.toThrow();
        const found = yield userProfileRepository.findById(profile1.userId);
        expect(found === null || found === void 0 ? void 0 : found.firstName).toBe('UpdatedFirst');
        expect(found === null || found === void 0 ? void 0 : found.phoneNumber).toBe('123456');
        expect(found === null || found === void 0 ? void 0 : found.lastName).toBe(profile1.lastName); // Should not change
        expect(found === null || found === void 0 ? void 0 : found.updatedAt).not.toEqual(profile1.updatedAt);
    }));
    it('should throw error when updating non-existent profile (implement check)', () => __awaiter(void 0, void 0, void 0, function* () {
        const updates = { firstName: 'UpdatedFirst' };
        // Assuming repo's update uses ConditionExpression: 'attribute_exists(PK)'
        yield expect(userProfileRepository.update('non-existent-user', updates)).rejects.toThrow(BaseError_1.BaseError); // Or specific NotFoundError
    }));
    it('should delete an existing profile', () => __awaiter(void 0, void 0, void 0, function* () {
        yield userProfileRepository.save(profile1);
        yield expect(userProfileRepository.delete(profile1.userId)).resolves.not.toThrow();
        const found = yield userProfileRepository.findById(profile1.userId);
        expect(found).toBeNull();
    }));
    it('should not throw when deleting non-existent profile (idempotent)', () => __awaiter(void 0, void 0, void 0, function* () {
        // Delete is often idempotent, depends on implementation (e.g., if ConditionExpression used)
        yield expect(userProfileRepository.delete('non-existent-user')).resolves.not.toThrow();
    }));
    // Add tests for other findBy* methods if implemented (findByPhoneNumber, findByMfaStatus)
});
