// tests/integration/DynamoUserProfileRepository.integration.spec.ts
import 'reflect-metadata';
import { IUserProfileRepository } from '../../../src/application/interfaces/IUserProfileRepository'; // Assuming path
import { container } from 'tsyringe';
import { UserProfile } from '../../../src/domain/entities/UserProfile'; // Assuming path
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { createTestTable, deleteTestTable, clearTestTable, destroyDynamoDBClient, TEST_TABLE_NAME, setupIntegrationTest } from '../../helpers/dynamodb.helper';

describe('DynamoUserProfileRepository Integration Tests', () => {
    let userProfileRepository: IUserProfileRepository;

    beforeAll(async () => {
        setupIntegrationTest(); // Setup container with test config
        await createTestTable();
        userProfileRepository = container.resolve<IUserProfileRepository>(TYPES.UserProfileRepository);
    });

    afterAll(async () => {
        await deleteTestTable();
        destroyDynamoDBClient();
    });

    // Add beforeEach/afterEach for item cleanup
    beforeEach(async () => {
        await clearTestTable();
    });

    const profile1 = new UserProfile('user-prof-1', 'profile1@test.com', 'Profile', 'One');
    const profile2 = new UserProfile('user-prof-2', 'profile2@test.com', 'Profile', 'Two');


    it('should save a new user profile', async () => {
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();

        const found = await userProfileRepository.findById(profile1.userId);
        expect(found).toBeInstanceOf(UserProfile);
        expect(found?.userId).toBe(profile1.userId);
        expect(found?.email).toBe(profile1.email);
        expect(found?.firstName).toBe(profile1.firstName);
    });

    it('should throw error when saving duplicate user profile (implement check in repo)', async () => {
        await userProfileRepository.save(profile1);
        // Assuming repo's save uses ConditionExpression: 'attribute_not_exists(PK)'
        await expect(userProfileRepository.save(profile1)).rejects.toThrow(BaseError); // Or specific DuplicateError
    });


    it('should find an existing profile by ID', async () => {
        await userProfileRepository.save(profile1);
        const found = await userProfileRepository.findById(profile1.userId);
        expect(found).toBeInstanceOf(UserProfile);
        expect(found?.userId).toBe(profile1.userId);
    });

    it('should return null when finding non-existent profile by ID', async () => {
        const found = await userProfileRepository.findById('non-existent-user');
        expect(found).toBeNull();
    });

     it('should find an existing profile by Email (assuming index exists)', async () => {
        await userProfileRepository.save(profile1);
        const found = await userProfileRepository.findByEmail(profile1.email);
        expect(found).toBeInstanceOf(UserProfile);
        expect(found?.userId).toBe(profile1.userId);
        expect(found?.email).toBe(profile1.email);
    });

     it('should return null when finding non-existent profile by Email', async () => {
        const found = await userProfileRepository.findByEmail('nonexistent@test.com');
        expect(found).toBeNull();
    });

    it('should update an existing profile', async () => {
        await userProfileRepository.save(profile1);
        const updates: Partial<UserProfile> = { firstName: 'UpdatedFirst', phoneNumber: '123456' };
        await expect(userProfileRepository.update(profile1.userId, updates)).resolves.not.toThrow();

        const found = await userProfileRepository.findById(profile1.userId);
        expect(found?.firstName).toBe('UpdatedFirst');
        expect(found?.phoneNumber).toBe('123456');
        expect(found?.lastName).toBe(profile1.lastName); // Should not change
        expect(found?.updatedAt).not.toEqual(profile1.updatedAt);
    });

     it('should throw error when updating non-existent profile (implement check)', async () => {
         const updates: Partial<UserProfile> = { firstName: 'UpdatedFirst' };
         // Assuming repo's update uses ConditionExpression: 'attribute_exists(PK)'
         await expect(userProfileRepository.update('non-existent-user', updates)).rejects.toThrow(BaseError); // Or specific NotFoundError
     });

    it('should delete an existing profile', async () => {
        await userProfileRepository.save(profile1);
        await expect(userProfileRepository.delete(profile1.userId)).resolves.not.toThrow();
        const found = await userProfileRepository.findById(profile1.userId);
        expect(found).toBeNull();
    });

     it('should not throw when deleting non-existent profile (idempotent)', async () => {
         // Delete is often idempotent, depends on implementation (e.g., if ConditionExpression used)
         await expect(userProfileRepository.delete('non-existent-user')).resolves.not.toThrow();
     });

    // Add tests for other findBy* methods if implemented (findByPhoneNumber, findByMfaStatus)
});