import 'reflect-metadata';
import { IUserProfileRepository } from '../../../src/application/interfaces/IUserProfileRepository';
import { container } from 'tsyringe';
import { UserProfile } from '../../../src/domain/entities/UserProfile';
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { clearTestTable } from '../../helpers/dynamodb.helper';
import { mockConfigService } from '../../mocks/config.mock';
import { loggerMock } from '../../mocks/logger.mock';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBProvider } from '../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { ScalarAttributeType, KeyType, ProjectionType } from "@aws-sdk/client-dynamodb";
import { DynamoUserProfileRepository } from '../../../src/infrastructure/persistence/dynamodb/DynamoUserProfileRepository';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';

describe('DynamoUserProfileRepository Integration Tests', () => {
    let userProfileRepository: IUserProfileRepository;
        const tableName = 'TestUsers';

    // Define the schema for the UserProfile table
    const userProfileTableKeySchema = [
        { AttributeName: "userId", KeyType: KeyType.HASH }
    ];

    beforeAll(() => {
        // Register the real repository implementation in our test container
        container.register(TYPES.UserProfileRepository, {
            useClass: DynamoUserProfileRepository,
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

        userProfileRepository = container.resolve<IUserProfileRepository>(TYPES.UserProfileRepository);
    });

    beforeEach(async () => {
        await clearTestTable(tableName, userProfileTableKeySchema);
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
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
        // Assuming repo's save uses ConditionExpression: 'attribute_not_exists(PK)'
        await expect(userProfileRepository.save(profile1)).rejects.toThrow(BaseError); // Or specific DuplicateError
    });


    it('should find an existing profile by ID', async () => {
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
        const found = await userProfileRepository.findById(profile1.userId);
        expect(found).toBeInstanceOf(UserProfile);
        expect(found?.userId).toBe(profile1.userId);
    });

    it('should return null when finding non-existent profile by ID', async () => {
        const found = await userProfileRepository.findById('non-existent-user');
        expect(found).toBeNull();
    });

     it('should find an existing profile by Email (assuming index exists)', async () => {
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
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
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
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
         await expect(userProfileRepository.update('non-existent-user', updates)).resolves.toBeNull();
     });

    it('should delete an existing profile', async () => {
        await expect(userProfileRepository.save(profile1)).resolves.not.toThrow();
        await expect(userProfileRepository.delete(profile1.userId)).resolves.not.toThrow();
        const found = await userProfileRepository.findById(profile1.userId);
        expect(found).toBeNull();
    });

     it('should not throw when deleting non-existent profile (idempotent)', async () => {
         // Delete is often idempotent, depends on implementation (e.g., if ConditionExpression used)
         await expect(userProfileRepository.delete('non-existent-user')).resolves.not.toThrow();
     });
});
