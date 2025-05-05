import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import 'reflect-metadata'; // Must be first

import { IPolicyRepository } from '../../../src/application/interfaces/IPolicyRepository';
import { container } from '../../../src/container';
import { Policy } from '../../../src/domain/entities/Policy';
import { TYPES } from '../../../src/shared/constants/types';
import { createTestTable, deleteTestTable, getTestDocumentClient, TEST_TABLE_NAME } from '../../helpers/dynamodb.helper'; // Adjust path

// --- Test Suite ---
describe('DynamoPolicyRepository Integration Tests', () => {
    let policyRepository: IPolicyRepository;
    const testPoliciesToCleanup: Policy[] = []; // Track created items for cleanup

    // --- Test Setup & Teardown ---
    beforeAll(async () => {
        // Ensure the environment variable used by the actual ConfigService is set
        process.env.AUTHZ_TABLE_NAME = TEST_TABLE_NAME;
        await createTestTable(); // Create table before tests run
        policyRepository = container.resolve<IPolicyRepository>(TYPES.PolicyRepository);
    });

    afterAll(async () => {
        await deleteTestTable(); // Delete table after all tests
    });

    // Cleanup items created during tests
    afterEach(async () => {
        const docClient = getTestDocumentClient(); // Get client for cleanup
        for (const policy of testPoliciesToCleanup) {
            try {
                const pk = `POLICY#${policy.id}`;
                await docClient.send(new DeleteItemCommand({
                    TableName: TEST_TABLE_NAME,
                    Key: marshall({ PK: pk, SK: pk }), // Use marshall for base client
                }));
            } catch (e) {
                // Ignore errors during cleanup (e.g., item already deleted)
            }
        }
        testPoliciesToCleanup.length = 0; // Clear the array
    });

    // Helper to create and track a policy
    const createAndTrackPolicy = async (policy: Policy): Promise<Policy> => {
        await policyRepository.save(policy);
        testPoliciesToCleanup.push(policy);
        return policy;
    };

    // --- Test Cases ---

    describe('save (create)', () => {
        it('should create a new policy successfully', async () => {
            const policy = new Policy('uuid-create-1', 'policy.create.1', 'def', 'rego', 'Desc 1');
            await expect(createAndTrackPolicy(policy)).resolves.toEqual(policy);

            // Verify by fetching directly (optional but good for integration)
            const found = await policyRepository.findById(policy.id);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.policyName).toBe(policy.policyName);
            expect(found?.policyDefinition).toBe(policy.policyDefinition);
        });

        // Note: The base 'save' method uses PutItem without condition checks for creation uniqueness.
        // Uniqueness based on ID is implicit. Uniqueness on policyName relies on the GSI approach or service layer checks.
        // Therefore, a test for PolicyExistsError on create might not apply directly to `save` unless implemented differently.
        it('should overwrite an existing policy with the same ID', async () => {
            const policy = new Policy('uuid-overwrite-1', 'policy.overwrite.1', 'def1', 'rego');
            await createAndTrackPolicy(policy); // Create first

            const updatedPolicyData = { ...policy, description: 'Updated Description', policyDefinition: 'def2' };
            const updatedPolicy = new Policy(
                updatedPolicyData.id,
                updatedPolicyData.policyName,
                updatedPolicyData.policyDefinition,
                updatedPolicyData.policyLanguage,
                updatedPolicyData.description
             );

            await expect(policyRepository.save(updatedPolicy)).resolves.not.toThrow();

             // Verify update
             const found = await policyRepository.findById(policy.id);
             expect(found?.description).toBe('Updated Description');
             expect(found?.policyDefinition).toBe('def2');
        });
    });

    describe('findById', () => {
        it('should find an existing policy by ID', async () => {
            const policy = new Policy('uuid-find-id-1', 'policy.find.id.1', 'def', 'rego');
            await createAndTrackPolicy(policy);

            const found = await policyRepository.findById(policy.id);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.id).toBe(policy.id);
            expect(found?.policyName).toBe(policy.policyName);
        });

        it('should return null when finding a non-existent policy ID', async () => {
            const found = await policyRepository.findById('non-existent-uuid');
            expect(found).toBeNull();
        });
    });

    // Note: Tests for findByName rely on Scan currently. They will need adjustment
    //       if/when findByName is implemented using a GSI and Query.
    describe('findByName (using Scan)', () => {
        it('should find an existing policy by name using Scan', async () => {
            const policy = new Policy('uuid-find-name-1', 'policy.find.name.scan.1', 'def', 'rego');
            await createAndTrackPolicy(policy);

            const found = await policyRepository.findByName(policy.policyName);
            expect(found).toBeInstanceOf(Policy);
            expect(found?.id).toBe(policy.id);
            expect(found?.policyName).toBe(policy.policyName);
        });

         it('should return null when finding a non-existent policy name using Scan', async () => {
            const found = await policyRepository.findByName('policy.nonexistent.scan');
            expect(found).toBeNull();
        });

        // This test might be flaky depending on scan consistency
        it('should return only one policy if multiple have the same name (Scan behavior)', async () => {
            const name = 'policy.find.name.scan.duplicate';
            const policy1 = new Policy('uuid-find-name-dup1', name, 'def1', 'rego');
            const policy2 = new Policy('uuid-find-name-dup2', name, 'def2', 'rego');
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);

            const found = await policyRepository.findByName(name);
            expect(found).not.toBeNull();
            // Scan doesn't guarantee which one is returned first, but we expect one
            expect(found?.policyName).toBe(name);
        });
    });

     // Note: Tests for list rely on Scan currently. They will need adjustment
    //       if/when list is implemented using a GSI and Query.
    describe('list (using Scan)', () => {
        it('should list created policies', async () => {
            const policy1 = new Policy('uuid-list-1', 'policy.list.scan.1', 'def', 'rego');
            const policy2 = new Policy('uuid-list-2', 'policy.list.scan.2', 'def', 'cedar');
            const policy3 = new Policy('uuid-list-3', 'policy.list.scan.3', 'def', 'rego');
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);
            await createAndTrackPolicy(policy3);

            const result = await policyRepository.list({ limit: 5 });
            // Scan might return items in any order, just check presence
            expect(result.items.length).toBe(3);
            expect(result.items.map(p => p.id).sort()).toEqual(['uuid-list-1', 'uuid-list-2', 'uuid-list-3'].sort());
            expect(result.lastEvaluatedKey).toBeUndefined();
        });

        it('should list policies filtered by language', async () => {
            const policy1 = new Policy('uuid-list-lang-1', 'policy.list.lang.1', 'def', 'rego');
            const policy2 = new Policy('uuid-list-lang-2', 'policy.list.lang.2', 'def', 'cedar');
            await createAndTrackPolicy(policy1);
            await createAndTrackPolicy(policy2);

            const result = await policyRepository.list({ language: 'rego' });
            expect(result.items.length).toBe(1);
            expect(result.items[0].id).toBe(policy1.id);
            expect(result.items[0].policyLanguage).toBe('rego');
        });

        it('should handle pagination with Scan (limit and startKey)', async () => {
             const policy1 = new Policy('uuid-list-page-1', 'policy.list.page.1', 'def', 'rego');
             const policy2 = new Policy('uuid-list-page-2', 'policy.list.page.2', 'def', 'rego');
             await createAndTrackPolicy(policy1);
             await createAndTrackPolicy(policy2);

             // First page
             const result1 = await policyRepository.list({ limit: 1 });
             expect(result1.items.length).toBe(1);
             expect(result1.lastEvaluatedKey).toBeDefined();

             // Second page
             const result2 = await policyRepository.list({ limit: 1, startKey: result1.lastEvaluatedKey });
             expect(result2.items.length).toBe(1);
             // Ensure item is different from first page
             expect(result2.items[0].id).not.toBe(result1.items[0].id);
             // Might have another key if total > 2, or undefined if done
        });
    });

    describe('delete', () => {
        it('should delete an existing policy and return true', async () => {
            const policy = new Policy('uuid-delete-1', 'policy.delete.1', 'def', 'rego');
            await createAndTrackPolicy(policy);

            const deleted = await policyRepository.delete(policy.id);
            expect(deleted).toBe(true);

            // Verify deletion
            const found = await policyRepository.findById(policy.id);
            expect(found).toBeNull();

            // Remove from cleanup array as it's already deleted
            testPoliciesToCleanup.pop();
        });

        it('should return false when deleting a non-existent policy', async () => {
            const deleted = await policyRepository.delete('non-existent-uuid');
            expect(deleted).toBe(false);
        });
    });
});