import { Express } from 'express';
import 'reflect-metadata'; // Must be first
import request from 'supertest';

// --- JEST CLASS MOCKING for Service ---
const mockPolicyAdminServiceImpl = { // Mock implementation object
    createPolicy: jest.fn(),
    getPolicy: jest.fn(),
    listPolicies: jest.fn(),
    updatePolicy: jest.fn(),
    deletePolicy: jest.fn(),
};
jest.mock('../../../src/application/services/policy.admin.service', () => ({ // <<< Path to the service file
    PolicyAdminService: jest.fn().mockImplementation(() => mockPolicyAdminServiceImpl)
}));
// --- END JEST CLASS MOCKING ---

// --- Application Imports (AFTER MOCKS) ---
import { createApp } from '../../../src/app'; // Adjust path
import { HttpStatusCode } from '../../../src/application/enums/HttpStatusCode';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../src/application/interfaces/ILogger';
import { container } from '../../../src/container'; // Adjust path
import { Policy } from '../../../src/domain/entities/Policy'; // Adjust path
import { InvalidPolicySyntaxError, PolicyExistsError, PolicyNotFoundError } from '../../../src/domain/exceptions/UserManagementError'; // Adjust path
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger'; // Adjust path
import { TYPES } from '../../../src/shared/constants/types';
import { mockConfigService } from '../../mocks/config.mock'; // Adjust path

// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345'; // Ensure matches guard config
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const BASE_API_PATH = '/api/admin/policies'; // Base path for policy routes

// --- Mock Payloads & Data (Adjust based on actual DTOs/Entities) ---
const testPolicyId = 'integ-policy-uuid-111';
const testPolicyName = 'policy.integ.test';
const MOCK_VALID_CREATE_POLICY_PAYLOAD = {
    policyName: testPolicyName,
    policyDefinition: 'package integ.test\ndefault allow = false',
    policyLanguage: 'rego',
    description: 'Integration Test Policy',
};
const MOCK_POLICY_ENTITY = new Policy(
    testPolicyId,
    testPolicyName,
    MOCK_VALID_CREATE_POLICY_PAYLOAD.policyDefinition,
    MOCK_VALID_CREATE_POLICY_PAYLOAD.policyLanguage,
    1, // version
    MOCK_VALID_CREATE_POLICY_PAYLOAD.description
);
const MOCK_VALID_UPDATE_POLICY_PAYLOAD = {
    description: 'Updated Integration Description',
    version: 'v1.1.0',
};

// --- Test Suite ---
describe(`Integration Tests: Policy Admin Routes (${BASE_API_PATH})`, () => {
    let app: Express;
    let logger: ILogger;

    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test'; // Ensure test environment for auth bypass
        container.reset();
        container.clearInstances();

        // Register mocks/instances needed by the application setup (createApp)
        container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
        container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
        // Service is mocked via jest.mock at the top level

        logger = container.resolve<ILogger>(TYPES.Logger);
        app = createApp(); // Create app *after* dependencies are set up
    });

    beforeEach(() => {
        jest.clearAllMocks(); // Resets service impl mock calls
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
    });

    // --- Test Cases ---

    describe(`POST ${BASE_API_PATH}`, () => {
        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockPolicyAdminServiceImpl.createPolicy.mockResolvedValueOnce(MOCK_POLICY_ENTITY);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('id', MOCK_POLICY_ENTITY.id);
            expect(response.body).toHaveProperty('policyName', MOCK_POLICY_ENTITY.policyName);
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'test-admin-id-123' }), // Mock admin user from bypass token
                MOCK_VALID_CREATE_POLICY_PAYLOAD
            );
        });

        it('should return 400 Bad Request if validation fails (e.g., missing policyName)', async () => {
            const invalidPayload = { ...MOCK_VALID_CREATE_POLICY_PAYLOAD, policyName: undefined };
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode.BAD_REQUEST) // 400
                .expect(res => { // Check validation error details
                    expect(res.body.name).toBe('ValidationError');
                    expect(res.body.details).toHaveProperty('body.policyName');
                });
            expect(mockPolicyAdminServiceImpl.createPolicy).not.toHaveBeenCalled();
        });

        it('should return 409 Conflict if service throws PolicyExistsError', async () => {
            const conflictError = new PolicyExistsError(MOCK_VALID_CREATE_POLICY_PAYLOAD.policyName);
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(conflictError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode.CONFLICT); // 409
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        });

        it('should return 400 Bad Request if service throws InvalidPolicySyntaxError', async () => {
            const syntaxError = new InvalidPolicySyntaxError(MOCK_VALID_CREATE_POLICY_PAYLOAD.policyName, 'rego');
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(syntaxError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 - Maps to bad request
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        });

        it('should return 500 Internal Server Error if service throws an unexpected error', async () => {
            const genericError = new Error('Create policy internal failure');
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .post(BASE_API_PATH)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.createPolicy).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'get-policy-integ-uuid';
        const mockPolicyData = new Policy(targetPolicyId, 'get.policy', 'def', 'rego', 1);

        it('should return 200 OK with policy data if policy exists', async () => {
            mockPolicyAdminServiceImpl.getPolicy.mockResolvedValueOnce(mockPolicyData);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK) // 200
                .expect(res => {
                    expect(res.body.id).toBe(targetPolicyId);
                    expect(res.body.policyName).toBe('get.policy');
                });
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockPolicyAdminServiceImpl.getPolicy.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.getPolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 400 Bad Request if policyId param is not a valid UUID', async () => {
            const invalidId = 'not-a-uuid';
            await request(app)
                .get(`${BASE_API_PATH}/${invalidId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockPolicyAdminServiceImpl.getPolicy).not.toHaveBeenCalled();
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('Cannot get policy');
            mockPolicyAdminServiceImpl.getPolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.getPolicy).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}`, () => {
         it('should return 200 OK with a list of policies', async () => {
             const mockPolicies = [MOCK_POLICY_ENTITY];
             mockPolicyAdminServiceImpl.listPolicies.mockResolvedValueOnce({ items: mockPolicies, lastEvaluatedKey: undefined });
             await request(app)
                 .get(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.OK); // 200
             expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
             expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: undefined, language: undefined, startKey: undefined });
         });

          it('should pass pagination and filter parameters to the service', async () => {
             mockPolicyAdminServiceImpl.listPolicies.mockResolvedValueOnce({ items: [], nextToken: 'more-policies' } as any); // Use nextToken if API uses it
             await request(app)
                 .get(BASE_API_PATH)
                 .query({ limit: 15, language: 'rego', startKey: 'opaqueStartKey' })
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.OK); // 200
             expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
             expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: 15, language: 'rego', startKey: 'opaqueStartKey' });
         });

         it('should return 500 if the service fails unexpectedly', async () => {
             const genericError = new Error('Cannot list policies');
             mockPolicyAdminServiceImpl.listPolicies.mockRejectedValueOnce(genericError);
             await request(app)
                 .get(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
             expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
         });

         it('should return 401 Unauthorized if token is missing', async () => {
             await request(app)
                 .get(BASE_API_PATH)
                 .expect(HttpStatusCode.UNAUTHORIZED); // 401
             expect(mockPolicyAdminServiceImpl.listPolicies).not.toHaveBeenCalled();
         });
    });

     describe(`PUT ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'update-policy-integ-uuid';
        const updatedPolicy = new Policy(targetPolicyId, 'updated.name', 'updated def', 'rego', 2, MOCK_VALID_UPDATE_POLICY_PAYLOAD.description);

        it('should return 200 OK with updated policy data if service succeeds', async () => {
            mockPolicyAdminServiceImpl.updatePolicy.mockResolvedValueOnce(updatedPolicy);
            await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.OK) // 200
                .expect(res => {
                    expect(res.body.id).toBe(targetPolicyId);
                    expect(res.body.description).toBe(MOCK_VALID_UPDATE_POLICY_PAYLOAD.description);
                    expect(res.body.version).toBe(MOCK_VALID_UPDATE_POLICY_PAYLOAD.version);
                });
            expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId, MOCK_VALID_UPDATE_POLICY_PAYLOAD);
        });

         it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.updatePolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledTimes(1);
        });

         it('should return 400 Bad Request if policyId param is invalid', async () => {
            await request(app)
                .put(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
        });

         it('should return 400 Bad Request if payload is invalid (e.g., empty)', async () => {
             await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send({}) // Empty payload might fail validation
                .expect(HttpStatusCode.BAD_REQUEST); // 400
             expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
         });

         it('should return 500 if service fails unexpectedly', async () => {
             const genericError = new Error('Update policy internal failure');
             mockPolicyAdminServiceImpl.updatePolicy.mockRejectedValueOnce(genericError);
             await request(app)
                 .put(`${BASE_API_PATH}/${targetPolicyId}`)
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                 .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
             expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledTimes(1);
         });

         it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
        });
    });

     describe(`DELETE ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'delete-policy-integ-uuid';

        it('should return 204 No Content if service succeeds', async () => {
            mockPolicyAdminServiceImpl.deletePolicy.mockResolvedValueOnce(undefined); // Returns void
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.deletePolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

         it('should return 400 Bad Request if policyId param is invalid', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminServiceImpl.deletePolicy).not.toHaveBeenCalled();
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Delete policy internal failure');
            mockPolicyAdminServiceImpl.deletePolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.deletePolicy).not.toHaveBeenCalled();
        });
    });

}); // End Test Suite