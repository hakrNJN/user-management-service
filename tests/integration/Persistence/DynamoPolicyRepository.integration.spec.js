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
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
require("reflect-metadata"); // Must be first
const container_1 = require("../../../src/container");
const Policy_1 = require("../../../src/domain/entities/Policy");
const types_1 = require("../../../src/shared/constants/types");
const dynamodb_helper_1 = require("../../helpers/dynamodb.helper"); // Adjust path
// --- Test Suite ---
describe('DynamoPolicyRepository Integration Tests', () => {
    let policyRepository;
    const testPoliciesToCleanup = []; // Track created items for cleanup
    // --- Test Setup & Teardown ---
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Ensure the environment variable used by the actual ConfigService is set
        process.env.AUTHZ_TABLE_NAME = dynamodb_helper_1.TEST_TABLE_NAME;
        yield (0, dynamodb_helper_1.createTestTable)(); // Create table before tests run
        policyRepository = container_1.container.resolve(types_1.TYPES.PolicyRepository);
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, dynamodb_helper_1.deleteTestTable)(); // Delete table after all tests
    }));
    // Cleanup items created during tests
    afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
        const docClient = (0, dynamodb_helper_1.getTestDocumentClient)(); // Get client for cleanup
        for (const policy of testPoliciesToCleanup) {
            try {
                const pk = `POLICY#${policy.id}`;
                yield docClient.send(new client_dynamodb_1.DeleteItemCommand({
                    TableName: dynamodb_helper_1.TEST_TABLE_NAME,
                    Key: (0, util_dynamodb_1.marshall)({ PK: pk, SK: pk }), // Use marshall for base client
                }));
            }
            catch (e) {
                // Ignore errors during cleanup (e.g., item already deleted)
            }
        }
        testPoliciesToCleanup.length = 0; // Clear the array
    }));
    // Helper to create and track a policy
    const createAndTrackPolicy = (policy) => __awaiter(void 0, void 0, void 0, function* () {
        yield policyRepository.save(policy);
        testPoliciesToCleanup.push(policy);
        return policy;
    });
    // --- Test Cases ---
    describe('save (create)', () => {
        it('should create a new policy successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy = new Policy_1.Policy('uuid-create-1', 'policy.create.1', 'def', 'rego', 1, 'Desc 1');
            yield expect(createAndTrackPolicy(policy)).resolves.toEqual(policy);
            // Verify by fetching directly (optional but good for integration)
            const found = yield policyRepository.findById(policy.id);
            expect(found).toBeInstanceOf(Policy_1.Policy);
            expect(found === null || found === void 0 ? void 0 : found.policyName).toBe(policy.policyName);
            expect(found === null || found === void 0 ? void 0 : found.policyDefinition).toBe(policy.policyDefinition);
        }));
        // Note: The base 'save' method uses PutItem without condition checks for creation uniqueness.
        // Uniqueness based on ID is implicit. Uniqueness on policyName relies on the GSI approach or service layer checks.
        // Therefore, a test for PolicyExistsError on create might not apply directly to `save` unless implemented differently.
        it('should overwrite an existing policy with the same ID', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy = new Policy_1.Policy('uuid-overwrite-1', 'policy.overwrite.1', 'def1', 'rego', 1);
            yield createAndTrackPolicy(policy); // Create first
            const updatedPolicyData = Object.assign(Object.assign({}, policy), { description: 'Updated Description', policyDefinition: 'def2' });
            const updatedPolicy = new Policy_1.Policy(updatedPolicyData.id, updatedPolicyData.policyName, updatedPolicyData.policyDefinition, updatedPolicyData.policyLanguage, updatedPolicyData.version + 1, // Increment version for update
            updatedPolicyData.description);
            yield expect(policyRepository.save(updatedPolicy)).resolves.not.toThrow();
            // Verify update
            const found = yield policyRepository.findById(policy.id);
            expect(found === null || found === void 0 ? void 0 : found.description).toBe('Updated Description');
            expect(found === null || found === void 0 ? void 0 : found.policyDefinition).toBe('def2');
        }));
    });
    describe('findById', () => {
        it('should find an existing policy by ID', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy = new Policy_1.Policy('uuid-find-id-1', 'policy.find.id.1', 'def', 'rego', 1);
            yield createAndTrackPolicy(policy);
            const found = yield policyRepository.findById(policy.id);
            expect(found).toBeInstanceOf(Policy_1.Policy);
            expect(found === null || found === void 0 ? void 0 : found.id).toBe(policy.id);
            expect(found === null || found === void 0 ? void 0 : found.policyName).toBe(policy.policyName);
        }));
        it('should return null when finding a non-existent policy ID', () => __awaiter(void 0, void 0, void 0, function* () {
            const found = yield policyRepository.findById('non-existent-uuid');
            expect(found).toBeNull();
        }));
    });
    // Note: Tests for findByName rely on Scan currently. They will need adjustment
    //       if/when findByName is implemented using a GSI and Query.
    describe('findByName (using Scan)', () => {
        it('should find an existing policy by name using Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy = new Policy_1.Policy('uuid-find-name-1', 'policy.find.name.scan.1', 'def', 'rego', 1);
            yield createAndTrackPolicy(policy);
            const found = yield policyRepository.findByName(policy.policyName);
            expect(found).toBeInstanceOf(Policy_1.Policy);
            expect(found === null || found === void 0 ? void 0 : found.id).toBe(policy.id);
            expect(found === null || found === void 0 ? void 0 : found.policyName).toBe(policy.policyName);
        }));
        it('should return null when finding a non-existent policy name using Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            const found = yield policyRepository.findByName('policy.nonexistent.scan');
            expect(found).toBeNull();
        }));
        // This test might be flaky depending on scan consistency
        it('should return only one policy if multiple have the same name (Scan behavior)', () => __awaiter(void 0, void 0, void 0, function* () {
            const name = 'policy.find.name.scan.duplicate';
            const policy1 = new Policy_1.Policy('uuid-find-name-dup1', name, 'def1', 'rego', 1);
            const policy2 = new Policy_1.Policy('uuid-find-name-dup2', name, 'def2', 'rego', 1);
            yield createAndTrackPolicy(policy1);
            yield createAndTrackPolicy(policy2);
            const found = yield policyRepository.findByName(name);
            expect(found).not.toBeNull();
            // Scan doesn't guarantee which one is returned first, but we expect one
            expect(found === null || found === void 0 ? void 0 : found.policyName).toBe(name);
        }));
    });
    // Note: Tests for list rely on Scan currently. They will need adjustment
    //       if/when list is implemented using a GSI and Query.
    describe('list (using Scan)', () => {
        it('should list created policies', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy1 = new Policy_1.Policy('uuid-list-1', 'policy.list.scan.1', 'def', 'rego', 1);
            const policy2 = new Policy_1.Policy('uuid-list-2', 'policy.list.scan.2', 'def', 'cedar', 1);
            const policy3 = new Policy_1.Policy('uuid-list-3', 'policy.list.scan.3', 'def', 'rego', 1);
            yield createAndTrackPolicy(policy1);
            yield createAndTrackPolicy(policy2);
            yield createAndTrackPolicy(policy3);
            const result = yield policyRepository.list({ limit: 5 });
            // Scan might return items in any order, just check presence
            expect(result.items.length).toBe(3);
            expect(result.items.map(p => p.id).sort()).toEqual(['uuid-list-1', 'uuid-list-2', 'uuid-list-3'].sort());
            expect(result.lastEvaluatedKey).toBeUndefined();
        }));
        it('should list policies filtered by language', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy1 = new Policy_1.Policy('uuid-list-lang-1', 'policy.list.lang.1', 'def', 'rego', 1);
            const policy2 = new Policy_1.Policy('uuid-list-lang-2', 'policy.list.lang.2', 'def', 'cedar', 1);
            yield createAndTrackPolicy(policy1);
            yield createAndTrackPolicy(policy2);
            const result = yield policyRepository.list({ language: 'rego' });
            expect(result.items.length).toBe(1);
            expect(result.items[0].id).toBe(policy1.id);
            expect(result.items[0].policyLanguage).toBe('rego');
        }));
        it('should handle pagination with Scan (limit and startKey)', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy1 = new Policy_1.Policy('uuid-list-page-1', 'policy.list.page.1', 'def', 'rego', 1);
            const policy2 = new Policy_1.Policy('uuid-list-page-2', 'policy.list.page.2', 'def', 'rego', 1);
            yield createAndTrackPolicy(policy1);
            yield createAndTrackPolicy(policy2);
            // First page
            const result1 = yield policyRepository.list({ limit: 1 });
            expect(result1.items.length).toBe(1);
            expect(result1.lastEvaluatedKey).toBeDefined();
            // Second page
            const result2 = yield policyRepository.list({ limit: 1, startKey: result1.lastEvaluatedKey });
            expect(result2.items.length).toBe(1);
            // Ensure item is different from first page
            expect(result2.items[0].id).not.toBe(result1.items[0].id);
            // Might have another key if total > 2, or undefined if done
        }));
    });
    describe('delete', () => {
        it('should delete an existing policy and return true', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy = new Policy_1.Policy('uuid-delete-1', 'policy.delete.1', 'def', 'rego', 1);
            yield createAndTrackPolicy(policy);
            const deleted = yield policyRepository.delete(policy.id);
            expect(deleted).toBe(true);
            // Verify deletion
            const found = yield policyRepository.findById(policy.id);
            expect(found).toBeNull();
            // Remove from cleanup array as it's already deleted
            testPoliciesToCleanup.pop();
        }));
        it('should return false when deleting a non-existent policy', () => __awaiter(void 0, void 0, void 0, function* () {
            const deleted = yield policyRepository.delete('non-existent-uuid');
            expect(deleted).toBe(false);
        }));
    });
});
