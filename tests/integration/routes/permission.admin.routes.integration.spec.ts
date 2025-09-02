// tests/integration/routes/permission.admin.routes.integration.spec.ts

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
import { Permission } from '../../../src/domain/entities/Permission';
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger';
import { TYPES } from '../../../src/shared/constants/types';
import { mockConfigService } from '../../mocks/config.mock';
import { JwtValidator } from '../../../src/shared/utils/jwtValidator';

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
    validate: jest.fn().mockResolvedValue({ sub: 'test-admin-id-123', 'cognito:username': 'test-admin', 'cognito:groups': ['permission-admin', 'user'] }),
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
const BASE_API_PATH = '/api/admin/permissions';

const MOCK_VALID_CREATE_PERMISSION_PAYLOAD = {
    permissionName: `perm:test-${Date.now()}`,
    description: 'Test Permission Description',
};

// --- Test Suite ---
describe(`Integration Tests: Permission Admin Routes (${BASE_API_PATH})`, () => {
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
        const mockCreatedPermission: Partial<Permission> = {
            permissionName: MOCK_VALID_CREATE_PERMISSION_PAYLOAD.permissionName,
            description: MOCK_VALID_CREATE_PERMISSION_PAYLOAD.description,
        };

        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockPermissionAdminService.createPermission.mockResolvedValueOnce(mockCreatedPermission as Permission);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_PERMISSION_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
               .expect('Content-Type', /json/);

               expect(response.body).toHaveProperty('permissionName', mockCreatedPermission.permissionName);
               expect(response.body.description).toEqual(mockCreatedPermission.description);
            expect(mockPermissionAdminService.createPermission).toHaveBeenCalledTimes(1);
        });

        it('should return 400 on validation error (e.g., missing permissionName)', async () => {
             const invalidPayload = { description: 'Only description' };
             const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload);

             expect(response.status).toBe(400);
             expect(response.body.name).toBe('ValidationError');
             expect(response.body.details).toEqual({'body.permissionName': 'Permission name is required'});
             expect(mockPermissionAdminService.createPermission).not.toHaveBeenCalled();
        });

         it('should return 409 if permission already exists', async () => {
             const { PermissionExistsError } = require('../../../src/domain/exceptions/UserManagementError');
             const error = new PermissionExistsError(MOCK_VALID_CREATE_PERMISSION_PAYLOAD.permissionName);
             mockPermissionAdminService.createPermission.mockRejectedValue(error);

             const response = await request(app)
                 .post(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_VALID_CREATE_PERMISSION_PAYLOAD);

             expect(response.status).toBe(409);
             expect(response.body.name).toBe('PermissionExistsError');
         });

         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app)
                 .post(BASE_API_PATH)
                 // No Auth header
                 .send(MOCK_VALID_CREATE_PERMISSION_PAYLOAD);
             expect(response.status).toBe(401);
         });
    });

    // --- GET /api/admin/permissions/:permissionName ---
    describe('GET /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:read';
        const existingPerm = new Permission(permName, 'Read permission');

        it('should return 200 and the permission if found', async () => {
             mockPermissionAdminService.getPermission.mockResolvedValue(existingPerm);
             const response = await request(app)
                 .get(`${BASE_API_PATH}/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(200);
             expect(response.body.permissionName).toBe(permName);
             expect(mockPermissionAdminService.getPermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName
             );
        });

         it('should return 404 if permission not found', async () => {
             mockPermissionAdminService.getPermission.mockResolvedValue(null);
             const response = await request(app)
                 .get(`${BASE_API_PATH}/not-found-perm`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(404);
             // Check based on controller's response or NotFoundError handling in middleware
             expect(response.body.message).toContain('not found');
         });

          it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`${BASE_API_PATH}/${permName}`);
             expect(response.status).toBe(401);
         });
    });

     // --- GET /api/admin/permissions ---
     describe('GET /api/admin/permissions', () => {
        it('should return 200 and list of permissions', async () => {
            const permList = [new Permission('p1'), new Permission('p2')];
            const queryResult = { items: permList, lastEvaluatedKey: undefined };
             mockPermissionAdminService.listPermissions.mockResolvedValue(queryResult);

             const response = await request(app)
                 .get(`${BASE_API_PATH}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .query({ limit: 10 }); // Example query param

             expect(response.status).toBe(200);
             expect(response.body.items).toHaveLength(2);
             expect(response.body.items[0].permissionName).toBe('p1');
             expect(mockPermissionAdminService.listPermissions).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 { limit: 10, startKey: undefined } // Check options parsing
             );
        });

         // Add tests for pagination query params if implemented
          it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`${BASE_API_PATH}`);
             expect(response.status).toBe(401);
         });
    });

     // --- PUT /api/admin/permissions/:permissionName ---
    describe('PUT /api/admin/permissions/:permissionName', () => {
         const permName = 'perm:update';
         const validPayload = { description: 'Updated description' };
         const updatedPerm = new Permission(permName, validPayload.description);

         it('should return 200 and updated permission on success', async () => {
             mockPermissionAdminService.updatePermission.mockResolvedValue(updatedPerm);
             const response = await request(app)
                 .put(`${BASE_API_PATH}/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);

             expect(response.status).toBe(200);
             expect(response.body.permissionName).toBe(permName);
             expect(response.body.description).toBe(validPayload.description);
             expect(mockPermissionAdminService.updatePermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName,
                 validPayload
             );
         });

         it('should return 404 if permission not found for update', async () => {
             mockPermissionAdminService.updatePermission.mockResolvedValue(null);
             const response = await request(app)
                 .put(`${BASE_API_PATH}/not-found-perm`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
             expect(response.status).toBe(404);
         });

         it('should return 400 on validation error (e.g., empty body)', async () => {
             const response = await request(app)
                 .put(`${BASE_API_PATH}/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send({}); // Empty body might fail validation
             expect(response.status).toBe(400);
             expect(response.body.name).toBe('ValidationError');
         });
          it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).put(`${BASE_API_PATH}/${permName}`).send(validPayload);
             expect(response.status).toBe(401);
         });
    });

    // --- DELETE /api/admin/permissions/:permissionName ---
    describe('DELETE /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:delete';

        it('should return 204 on successful deletion', async () => {
             mockPermissionAdminService.deletePermission.mockResolvedValue(undefined);
             const response = await request(app)
                 .delete(`${BASE_API_PATH}/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(204);
             expect(mockPermissionAdminService.deletePermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName
             );
        });

         it('should return 404 if permission not found for deletion', async () => {
             const { PermissionNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
             const error = new PermissionNotFoundError(permName);
             mockPermissionAdminService.deletePermission.mockRejectedValue(error);
             const response = await request(app)
                 .delete(`${BASE_API_PATH}/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
         });

         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).delete(`${BASE_API_PATH}/${permName}`);
             expect(response.status).toBe(401);
         });
    });

    // --- GET /api/admin/permissions/:permissionName/roles ---
    describe('GET /api/admin/permissions/:permissionName/roles', () => {
        const permName = 'perm:with:roles';
        const roles = ['role-a', 'role-b'];

        it('should return 200 and list of role names', async () => {
             mockPermissionAdminService.listRolesForPermission.mockResolvedValue(roles);
             const response = await request(app)
                 .get(`${BASE_API_PATH}/${permName}/roles`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(200);
             expect(response.body).toEqual({ roles });
             expect(mockPermissionAdminService.listRolesForPermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName
             );
        });

        it('should return 404 if permission is not found', async () => {
            const { PermissionNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const error = new PermissionNotFoundError(permName);
            mockPermissionAdminService.listRolesForPermission.mockRejectedValue(error);
             const response = await request(app)
                 .get(`${BASE_API_PATH}/${permName}/roles`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
        });
         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`${BASE_API_PATH}/${permName}/roles`);
             expect(response.status).toBe(401);
         });
    });
});
