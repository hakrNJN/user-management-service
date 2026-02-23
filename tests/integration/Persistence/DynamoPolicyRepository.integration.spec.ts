import 'reflect-metadata';
import { IPolicyRepository } from '../../../src/application/interfaces/IPolicyRepository';
import { container } from 'tsyringe';
import { Policy } from '../../../src/domain/entities/Policy';
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError } from '../../../src/shared/errors/BaseError';
import { clearTestTable, createTestTable, deleteTestTable } from '../../helpers/dynamodb.helper';
import { mockConfigService } from '../../mocks/config.mock';
import { loggerMock } from '../../mocks/logger.mock';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBProvider } from '../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { ScalarAttributeType, KeyType, ProjectionType } from "@aws-sdk/client-dynamodb";
import { DynamoPolicyRepository } from '../../../src/infrastructure/persistence/dynamodb/DynamoPolicyRepository';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';

describe('DynamoPolicyRepository Integration Tests', () => {
    let policyRepository: IPolicyRepository;
    const tableName = 'TestPolicies'; // Using the same table as assignments

    // Define the schema for the Policy table
    const policyTableKeySchema = [
        { AttributeName: "PK", KeyType: KeyType.HASH },
        { AttributeName: "SK", KeyType: KeyType.RANGE }
    ];

    const policyTableAttributeDefinitions = [
        { AttributeName: "PK", AttributeType: ScalarAttributeType.S },
        { AttributeName: "SK", AttributeType: ScalarAttributeType.S },
        { AttributeName: "EntityTypeGSI_PK", AttributeType: ScalarAttributeType.S },
        { AttributeName: "PolicyNameGSI_PK", AttributeType: ScalarAttributeType.S },
    ];

    const policyTableGSIs = [
        {
            IndexName: "EntityTypeGSI",
            KeySchema: [
                { AttributeName: "EntityTypeGSI_PK", KeyType: KeyType.HASH }
            ],
            Projection: { ProjectionType: ProjectionType.ALL },
            ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
        },
        {
            IndexName: "PolicyNameGSI",
            KeySchema: [
                { AttributeName: "PolicyNameGSI_PK", KeyType: KeyType.HASH }
            ],
            Projection: { ProjectionType: ProjectionType.ALL },
            ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
        }
    ];

    beforeAll(() => {
        // Register the real repository implementation in our test container
        container.register(TYPES.PolicyRepository, {
            useClass: DynamoPolicyRepository,
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
                return new DynamoDBProvider(config, client);
            },
        });

        policyRepository = container.resolve<IPolicyRepository>(TYPES.PolicyRepository);
    });

    beforeEach(async () => {
        await clearTestTable(tableName, policyTableKeySchema);
    });

    // Helper to create a policy (no longer needs to track for cleanup)
    const createAndTrackPolicy = async (policy: Policy): Promise<Policy> => {
        await policyRepository.save(policy);
        return policy;
    };

    // --- Test Cases ---

    describe('save (create)', () => {
        it('should create a new policy successfully', async () => {
            const policy = new Policy('test-tenant', 'uuid-create-1', 'policy.create.1', 'def', 'rego', 1, 'Desc 1');
            await expect(createAndTrackPolicy(policy)).resolves.toEqual(policy);

            // Verify by fetching directly (optional but good for integration)
            const found = await policyRepository.findById('test-tenant', policy.id);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.policyName).toBe(policy.policyName);
            expect(found?.policyDefinition).toBe(policy.policyDefinition);
        });

        it('should overwrite an existing policy with the same ID', async () => {
            const policy = new Policy('test-tenant', 'uuid-overwrite-1', 'policy.overwrite.1', 'def1', 'rego', 1);
            await createAndTrackPolicy(policy); // Create first

            const updatedPolicyData = { ...policy, description: 'Updated Description', policyDefinition: 'def2' };
            const updatedPolicy = new Policy('test-tenant', updatedPolicyData.id,
                updatedPolicyData.policyName,
                updatedPolicyData.policyDefinition,
                updatedPolicyData.policyLanguage,
                updatedPolicyData.version + 1, // Increment version for update
                updatedPolicyData.description
            );

            await expect(policyRepository.save(updatedPolicy)).resolves.not.toThrow();

            // Verify update
            const found = await policyRepository.findById('test-tenant', policy.id);
            expect(found?.description).toBe('Updated Description');
            expect(found?.policyDefinition).toBe('def2');
        });
    });

    describe('findById', () => {
        it('should find an existing policy by ID', async () => {
            const policy = new Policy('test-tenant', 'uuid-find-id-1', 'policy.find.id.1', 'def', 'rego', 1);
            await createAndTrackPolicy(policy);

            const found = await policyRepository.findById('test-tenant', policy.id);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.id).toBe(policy.id);
            expect(found?.policyName).toBe(policy.policyName);
        });

        it('should return null when finding a non-existent policy ID', async () => {
            const found = await policyRepository.findById('test-tenant', 'non-existent-uuid');
            expect(found).toBeNull();
        });
    });

    // Note: Tests for findByName rely on Scan currently. They will need adjustment
    //       if/when findByName is implemented using a GSI and Query.
    describe('findByName (using GSI)', () => {
        it('should find an existing policy by name using GSI', async () => {
            const policy = new Policy('test-tenant', 'uuid-find-name-1', 'policy.find.name.gsi.1', 'def', 'rego', 1);
            await createAndTrackPolicy(policy);

            const found = await policyRepository.findByName('test-tenant', policy.policyName);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.id).toBe(policy.id);
            expect(found?.policyName).toBe(policy.policyName);
        });

        it('should return null when finding a non-existent policy name using GSI', async () => {
            const found = await policyRepository.findByName('test-tenant', 'policy.nonexistent.gsi');
            expect(found).toBeNull();
        });

        // This test might be flaky depending on scan consistency
        it('should return only one policy if multiple have the same name (GSI behavior)', async () => {
            const name = 'policy.find.name.gsi.duplicate';
            const policy1 = new Policy('test-tenant', 'uuid-find-name-dup1', name, 'def1', 'rego', 1);
            const policy2 = new Policy('test-tenant', 'uuid-find-name-dup2', name, 'def2', 'rego', 1);
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);

            const found = await policyRepository.findByName('test-tenant', name);
            expect(found).not.toBeNull();
            // Scan doesn't guarantee which one is returned first, but we expect one
            expect(found?.policyName).toBe(name);
        });
    });

    // Note: Tests for list rely on Scan currently. They will need adjustment
    //       if/when list is implemented using a GSI and Query.
    describe('list (using GSI)', () => {
        it('should list created policies', async () => {
            const policy1 = new Policy('test-tenant', 'uuid-list-1', 'policy.list.gsi.1', 'def', 'rego', 1);
            const policy2 = new Policy('test-tenant', 'uuid-list-2', 'policy.list.gsi.2', 'def', 'cedar', 1);
            const policy3 = new Policy('test-tenant', 'uuid-list-3', 'policy.list.gsi.3', 'def', 'rego', 1);
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);
            await createAndTrackPolicy(policy3);

            const result = await policyRepository.list('test-tenant', { limit: 5 });
            // Scan might return items in any order, just check presence
            expect(result.items.length).toBe(3);
            expect(result.items.map(p => p.id).sort()).toEqual(['uuid-list-1', 'uuid-list-2', 'uuid-list-3'].sort());
            expect(result.lastEvaluatedKey).toBeUndefined();
        });

        it('should list policies filtered by language', async () => {
            const policy1 = new Policy('test-tenant', 'uuid-list-lang-1', 'policy.list.lang.1', 'def', 'rego', 1);
            const policy2 = new Policy('test-tenant', 'uuid-list-lang-2', 'policy.list.lang.2', 'def', 'cedar', 1);
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);

            const result = await policyRepository.list('test-tenant', { language: 'rego' });
            expect(result.items.length).toBe(1);
            expect(result.items[0].id).toBe(policy1.id);
            expect(result.items[0].policyLanguage).toBe('rego');
        });

        it('should handle pagination with GSI (limit and startKey)', async () => {
            const policy1 = new Policy('test-tenant', 'uuid-list-page-1', 'policy.list.page.1', 'def', 'rego', 1);
            const policy2 = new Policy('test-tenant', 'uuid-list-page-2', 'policy.list.page.2', 'def', 'rego', 1);
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);

            // First page
            const result1 = await policyRepository.list('test-tenant', { limit: 1 });
            expect(result1.items.length).toBe(1);
            expect(result1.lastEvaluatedKey).toBeDefined();

            // Second page
            const result2 = await policyRepository.list('test-tenant', { limit: 1, startKey: result1.lastEvaluatedKey });
            expect(result2.items.length).toBe(1);
            // Ensure item is different from first page
            expect(result2.items[0].id).not.toBe(result1.items[0].id);
            // Might have another key if total > 2, or undefined if done
        });
    });

    describe('delete', () => {
        it('should delete an existing policy and return true', async () => {
            const policy = new Policy('test-tenant', 'uuid-delete-1', 'policy.delete.1', 'def', 'rego', 1);
            await createAndTrackPolicy(policy);

            const deleted = await policyRepository.delete('test-tenant', policy.id);
            expect(deleted).toBe(true);

            // Verify deletion
            const found = await policyRepository.findById('test-tenant', policy.id);
            expect(found).toBeNull();


        });

        it('should return false when deleting a non-existent policy', async () => {
            const deleted = await policyRepository.delete('test-tenant', 'non-existent-uuid');
            expect(deleted).toBe(false);
        });
    });
});