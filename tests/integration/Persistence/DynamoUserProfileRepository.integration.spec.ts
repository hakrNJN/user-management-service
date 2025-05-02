// tests/integration/DynamoUserProfileRepository.integration.spec.ts
import 'reflect-metadata';
import { IUserProfileRepository } from '../../../src/application/interfaces/IUserProfileRepository'; // Assuming path
import { container } from '../../../src/container';
import { UserProfile } from '../../../src/domain/entities/UserProfile'; // Assuming path
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
// Assuming a separate User Profile table or different PK/SK structure
// Adjust TEST_TABLE_NAME and PK/SK structure if using the same table

describe('DynamoUserProfileRepository Integration Tests', () => {
    let userProfileRepository: IUserProfileRepository;
    const USER_PROFILE_TABLE_NAME = process.env.USER_PROFILE_TABLE_NAME_TEST || 'user-profiles-test'; // Use separate table potentially

    // Assume table creation/deletion handled globally or via helpers for USER_PROFILE_TABLE_NAME

    beforeAll(() => {
        process.env.AUTHZ_TABLE_NAME = USER_PROFILE_TABLE_NAME; // If it uses same config key
        // OR: Register a specific table name for UserProfile repo if needed
        userProfileRepository = container.resolve<IUserProfileRepository>(TYPES.UserProfileRepository); // Assuming registration exists
    });

    // Add beforeEach/afterEach for item cleanup

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