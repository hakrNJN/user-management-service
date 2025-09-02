// tests/integration/routes/policy.admin.routes.integration.spec.ts
import { Express } from 'express';
import 'reflect-metadata';
import request from 'supertest';

// --- Application Imports ---
import { HttpStatusCode } from '../../../src/application/enums/HttpStatusCode';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { IGroupAdminService } from '../../../src/application/interfaces/IGroupAdminService';
import { ILogger } from '../../../src/application/interfaces/ILogger';
import { IPermissionAdminService } from '../../../src/application/interfaces/IPermissionAdminService';
import { IPolicyAdminService } from '../../../src/application/interfaces/IPolicyAdminService';
import { IPolicyService } from '../../../src/application/interfaces/IPolicyService';
import { IRoleAdminService } from '../../../src/application/interfaces/IRoleAdminService';
import { IUserAdminService } from '../../../src/application/interfaces/IUserAdminService';
import { container } from '../../../src/container';
import { Policy } from '../../../src/domain/entities/Policy';
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger';
import { TYPES } from '../../../src/shared/constants/types';
import { JwtValidator } from '../../../src/shared/utils/jwtValidator';
import { mockConfigService } from '../../mocks/config.mock';

// --- Mock Service Layer ---
const mockGroupAdminService: jest.Mocked<IGroupAdminService> = {
    createGroup: jest.fn(), getGroup: jest.fn(), listGroups: jest.fn(), deleteGroup: jest.fn(),
    reactivateGroup: jest.fn(), assignRoleToGroup: jest.fn(), removeRoleFromGroup: jest.fn(), listRolesForGroup: jest.fn(),
};
const mockPermissionAdminService: jest.Mocked<IPermissionAdminService> = {
    createPermission: jest.fn(), getPermission: jest.fn(), listPermissions: jest.fn(), updatePermission: jest.fn(), deletePermission: jest.fn(),
    listRolesForPermission: jest.fn(),
};
const mockPolicyAdminService: jest.Mocked<IPolicyAdminService> = {
    createPolicy: jest.fn(), getPolicy: jest.fn(), listPolicies: jest.fn(), updatePolicy: jest.fn(), deletePolicy: jest.fn(),
    getPolicyVersion: jest.fn(), listPolicyVersions: jest.fn(), rollbackPolicy: jest.fn(),
};
const mockRoleAdminService: jest.Mocked<IRoleAdminService> = {
    createRole: jest.fn(), getRole: jest.fn(), listRoles: jest.fn(), updateRole: jest.fn(), deleteRole: jest.fn(),
    assignPermissionToRole: jest.fn(), removePermissionFromRole: jest.fn(), listPermissionsForRole: jest.fn(),
};
const mockUserAdminService: jest.Mocked<IUserAdminService> = {
    createUser: jest.fn(), listUsers: jest.fn(), getUser: jest.fn(), updateUserAttributes: jest.fn(), deleteUser: jest.fn(),
    disableUser: jest.fn(), enableUser: jest.fn(), initiatePasswordReset: jest.fn(), setUserPassword: jest.fn(),
    addUserToGroup: jest.fn(), removeUserFromGroup: jest.fn(), listGroupsForUser: jest.fn(), listUsersInGroup: jest.fn(),
    updateUserGroups: jest.fn(),
};
const mockPolicyService = {
    getPolicy: jest.fn(), listPolicies: jest.fn(),
} as any;

// --- Pre-emptive DI Container Setup ---
process.env.NODE_ENV = 'test';
process.env.AUTHZ_TABLE_NAME = 'test-authz-table'; // Set required env var
container.reset();
const mockJwtValidator = {
    validate: jest.fn().mockResolvedValue({ sub: 'test-admin-id-123', 'cognito:username': 'test-admin', 'cognito:groups': ['policy-admin', 'user'] }),
};
container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
container.register<JwtValidator>(TYPES.JwtValidator, { useValue: mockJwtValidator });
container.register<IGroupAdminService>(TYPES.GroupAdminService, { useValue: mockGroupAdminService });
container.register<IPermissionAdminService>(TYPES.PermissionAdminService, { useValue: mockPermissionAdminService });
container.register<IPolicyAdminService>(TYPES.PolicyAdminService, { useValue: mockPolicyAdminService });
container.register<IRoleAdminService>(TYPES.RoleAdminService, { useValue: mockRoleAdminService });
container.register<IUserAdminService>(TYPES.UserAdminService, { useValue: mockUserAdminService });
container.register<IPolicyService>(TYPES.PolicyService, { useValue: mockPolicyService });


// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const BASE_API_PATH = '/api/admin/policies';

const MOCK_VALID_CREATE_POLICY_PAYLOAD = {
    policyName: `policy-test-${Date.now()}`,
    policyDefinition: `package test
default allow = false`,
    policyLanguage: 'rego',
    description: 'Test Policy Description',
};

// --- Test Suite ---
describe(`Integration Tests: Policy Admin Routes (${BASE_API_PATH})`, () => {
    let app: Express;

    beforeAll(() => {
        const { createApp } = require('../../../src/app');
        app = createApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockJwtValidator.validate.mockClear();
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
    });

    // --- Test Cases ---

    describe(`POST ${BASE_API_PATH}`, () => {
        const mockCreatedPolicy: Partial<Policy> = {
            policyName: MOCK_VALID_CREATE_POLICY_PAYLOAD.policyName,
            policyDefinition: MOCK_VALID_CREATE_POLICY_PAYLOAD.policyDefinition,
            policyLanguage: MOCK_VALID_CREATE_POLICY_PAYLOAD.policyLanguage,
            description: MOCK_VALID_CREATE_POLICY_PAYLOAD.description,
            version: 1,
        };

        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockPolicyAdminService.createPolicy.mockResolvedValueOnce(mockCreatedPolicy as Policy);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('policyName', mockCreatedPolicy.policyName);
            expect(response.body.description).toEqual(mockCreatedPolicy.description);
            expect(mockPolicyAdminService.createPolicy).toHaveBeenCalledTimes(1);
        });
    });

    describe(`GET ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
        const mockPolicyData = new Policy(targetPolicyId, 'get.policy', 'def', 'rego', 1);

        it('should return 200 OK with policy data if policy exists', async () => {
            mockPolicyAdminService.getPolicy.mockResolvedValueOnce(mockPolicyData);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK) // 200
                .expect(res => {
                    expect(res.body.id).toBe(targetPolicyId);
                    expect(res.body.policyName).toBe('get.policy');
                });
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockPolicyAdminService.getPolicy.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const { PolicyNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminService.getPolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 400 Bad Request if policyId param is not a valid UUID', async () => {
            const invalidId = 'not-a-uuid';
            await request(app)
                .get(`${BASE_API_PATH}/${invalidId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockPolicyAdminService.getPolicy).not.toHaveBeenCalled();
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('Cannot get policy');
            mockPolicyAdminService.getPolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminService.getPolicy).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}`, () => {
         it('should return 200 OK with a list of policies', async () => {
             const mockPolicies = [new Policy('id1', 'policy1', 'def1', 'rego', 1)]; // Using Policy entity directly
             mockPolicyAdminService.listPolicies.mockResolvedValueOnce({ items: mockPolicies, lastEvaluatedKey: undefined });
             await request(app)
                 .get(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.OK); // 200
             expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledTimes(1);
             expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: undefined, language: undefined, startKey: undefined });
         });

          it('should pass pagination and filter parameters to the service', async () => {
             mockPolicyAdminService.listPolicies.mockResolvedValueOnce({ items: [], nextToken: 'more-policies' } as any); // Use nextToken if API uses it
             await request(app)
                 .get(BASE_API_PATH)
                 .query({ limit: 15, language: 'rego', startKey: 'opaqueStartKey' })
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.OK); // 200
             expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledTimes(1);
             expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: '15', language: 'rego', startKey: 'opaqueStartKey' });
         });

         it('should return 500 if the service fails unexpectedly', async () => {
             const genericError = new Error('Cannot list policies');
             mockPolicyAdminService.listPolicies.mockRejectedValueOnce(genericError);
             await request(app)
                 .get(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
             expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledTimes(1);
         });

         it('should return 401 Unauthorized if token is missing', async () => {
             await request(app)
                 .get(BASE_API_PATH)
                 .expect(HttpStatusCode.UNAUTHORIZED); // 401
             expect(mockPolicyAdminService.listPolicies).not.toHaveBeenCalled();
         });
    });

     describe(`PUT ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Using a valid UUID
        const MOCK_VALID_UPDATE_POLICY_PAYLOAD = {
            description: 'Updated Integration Description',
            version: 2,
        };
        const updatedPolicy = new Policy(targetPolicyId, 'updated.name', 'updated def', 'rego', MOCK_VALID_UPDATE_POLICY_PAYLOAD.version, MOCK_VALID_UPDATE_POLICY_PAYLOAD.description);

        it('should return 200 OK with updated policy data if service succeeds', async () => {
            mockPolicyAdminService.updatePolicy.mockResolvedValueOnce(updatedPolicy);
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
            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId, MOCK_VALID_UPDATE_POLICY_PAYLOAD);
        });

         it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const { PolicyNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminService.updatePolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledTimes(1);
        });

         it('should return 400 Bad Request if policyId param is invalid', async () => {
            await request(app)
                .put(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminService.updatePolicy).not.toHaveBeenCalled();
        });

         it('should return 400 Bad Request if payload is invalid (e.g., empty)', async () => {
             await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send({}) // Empty payload might fail validation
                .expect(HttpStatusCode.BAD_REQUEST); // 400
             expect(mockPolicyAdminService.updatePolicy).not.toHaveBeenCalled();
         });

         it('should return 500 if service fails unexpectedly', async () => {
             const genericError = new Error('Update policy internal failure');
             mockPolicyAdminService.updatePolicy.mockRejectedValueOnce(genericError);
             await request(app)
                 .put(`${BASE_API_PATH}/${targetPolicyId}`)
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                 .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
             expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledTimes(1);
         });

         it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminService.updatePolicy).not.toHaveBeenCalled();
        });
    });

     describe(`DELETE ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'b1c2d3e4-f5a6-7890-1234-567890abcdef'; // Using a valid UUID

        it('should return 204 No Content if service succeeds', async () => {
            mockPolicyAdminService.deletePolicy.mockResolvedValueOnce(undefined); // Returns void
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 404 Not Found if service throws PolicyNotFoundError', async () => {
            const { PolicyNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminService.deletePolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

         it('should return 400 Bad Request if policyId param is invalid', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminService.deletePolicy).not.toHaveBeenCalled();
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Delete policy internal failure');
            mockPolicyAdminService.deletePolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminService.deletePolicy).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}/:policyId/versions/:version`, () => {
        const policyId = 'c1d2e3f4-a5b6-7890-1234-567890abcdef'; // Valid UUID
        const version = 1;
        const mockPolicyVersionData = new Policy(policyId, 'version.policy', 'def', 'rego', version);

        it('should return 200 OK with policy version data if found', async () => {
            mockPolicyAdminService.getPolicyVersion.mockResolvedValueOnce(mockPolicyVersionData);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK)
                .expect(res => {
                    expect(res.body.id).toBe(policyId);
                    expect(res.body.version).toBe(version);
                });
            expect(mockPolicyAdminService.getPolicyVersion).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 404 Not Found if policy version not found', async () => {
            mockPolicyAdminService.getPolicyVersion.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND);
            expect(mockPolicyAdminService.getPolicyVersion).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 400 Bad Request if policyId is invalid', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/invalid-uuid/versions/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST);
            expect(mockPolicyAdminService.getPolicyVersion).not.toHaveBeenCalled();
        });

        it('should return 400 Bad Request if version is invalid', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions/invalid-version`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST);
            expect(mockPolicyAdminService.getPolicyVersion).not.toHaveBeenCalled();
        });

        it('should return 500 Internal Server Error if service fails unexpectedly', async () => {
            const genericError = new Error('Failed to get policy version');
            mockPolicyAdminService.getPolicyVersion.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR);
            expect(mockPolicyAdminService.getPolicyVersion).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions/${version}`)
                .expect(HttpStatusCode.UNAUTHORIZED);
            expect(mockPolicyAdminService.getPolicyVersion).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}/:policyId/versions`, () => {
        const policyId = 'd1e2f3a4-b5c6-7890-1234-567890abcdef'; // Valid UUID
        const mockPolicyVersions = [
            new Policy(policyId, 'policy.v1', 'def', 'rego', 1),
            new Policy(policyId, 'policy.v2', 'def', 'rego', 2),
        ];

        it('should return 200 OK with a list of policy versions', async () => {
            mockPolicyAdminService.listPolicyVersions.mockResolvedValueOnce(mockPolicyVersions);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK)
                .expect(res => {
                    expect(res.body).toHaveLength(2);
                    expect(res.body[0].version).toBe(1);
                    expect(res.body[1].version).toBe(2);
                });
            expect(mockPolicyAdminService.listPolicyVersions).toHaveBeenCalledWith(expect.anything(), policyId);
        });

        it('should return 404 Not Found if policy does not exist', async () => {
            const { PolicyNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new PolicyNotFoundError(policyId);
            mockPolicyAdminService.listPolicyVersions.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND);
            expect(mockPolicyAdminService.listPolicyVersions).toHaveBeenCalledWith(expect.anything(), policyId);
        });

        it('should return 400 Bad Request if policyId is invalid', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/invalid-uuid/versions`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST);
            expect(mockPolicyAdminService.listPolicyVersions).not.toHaveBeenCalled();
        });

        it('should return 500 Internal Server Error if service fails unexpectedly', async () => {
            const genericError = new Error('Failed to list policy versions');
            mockPolicyAdminService.listPolicyVersions.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR);
            expect(mockPolicyAdminService.listPolicyVersions).toHaveBeenCalledWith(expect.anything(), policyId);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${policyId}/versions`)
                .expect(HttpStatusCode.UNAUTHORIZED);
            expect(mockPolicyAdminService.listPolicyVersions).not.toHaveBeenCalled();
        });
    });

    describe(`POST ${BASE_API_PATH}/:policyId/rollback`, () => {
        const policyId = 'e1f2a3b4-c5d6-7890-1234-567890abcdef'; // Valid UUID
        const version = 1;
        const mockRolledBackPolicy = new Policy(policyId, 'rolled.back.policy', 'def', 'rego', version);

        it('should return 200 OK with rolled back policy data on success', async () => {
            mockPolicyAdminService.rollbackPolicy.mockResolvedValueOnce(mockRolledBackPolicy);
            await request(app)
                .post(`${BASE_API_PATH}/${policyId}/rollback/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK)
                .expect(res => {
                    expect(res.body.id).toBe(policyId);
                    expect(res.body.version).toBe(version);
                });
            expect(mockPolicyAdminService.rollbackPolicy).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 404 Not Found if policy or version not found', async () => {
            const { PolicyNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new PolicyNotFoundError(policyId);
            mockPolicyAdminService.rollbackPolicy.mockRejectedValueOnce(notFoundError);
            await request(app)
                .post(`${BASE_API_PATH}/${policyId}/rollback/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND);
            expect(mockPolicyAdminService.rollbackPolicy).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 400 Bad Request if policyId is invalid', async () => {
            await request(app)
                .post(`${BASE_API_PATH}/invalid-uuid/rollback/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST);
            expect(mockPolicyAdminService.rollbackPolicy).not.toHaveBeenCalled();
        });

        it('should return 400 Bad Request if version is invalid or missing', async () => {
            await request(app)
                .post(`${BASE_API_PATH}/${policyId}/rollback/invalid-version`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST);
            expect(mockPolicyAdminService.rollbackPolicy).not.toHaveBeenCalled();
        });

        it('should return 500 Internal Server Error if service fails unexpectedly', async () => {
            const genericError = new Error('Failed to rollback policy');
            mockPolicyAdminService.rollbackPolicy.mockRejectedValueOnce(genericError);
            await request(app)
                .post(`${BASE_API_PATH}/${policyId}/rollback/${version}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR);
            expect(mockPolicyAdminService.rollbackPolicy).toHaveBeenCalledWith(expect.anything(), policyId, version);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .post(`${BASE_API_PATH}/${policyId}/rollback`)
                .send({ version })
                .expect(HttpStatusCode.UNAUTHORIZED);
            expect(mockPolicyAdminService.rollbackPolicy).not.toHaveBeenCalled();
        });
    });
});
