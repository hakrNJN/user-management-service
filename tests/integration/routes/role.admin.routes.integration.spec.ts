
// tests/integration/routes/role.admin.routes.integration.spec.ts
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
import { Role } from '../../../src/domain/entities/Role';
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
    validate: jest.fn().mockResolvedValue({ sub: 'test-admin-id-123', 'cognito:username': 'test-admin', 'cognito:groups': ['role-admin', 'user'] }),
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
const BASE_API_PATH = '/api/admin/roles';

const MOCK_VALID_CREATE_ROLE_PAYLOAD = {
    roleName: `role-test-${Date.now()}`,
    description: 'Test Role Description',
};

// --- Test Suite ---
describe(`Integration Tests: Role Admin Routes (${BASE_API_PATH})`, () => {
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
        const mockCreatedRole: Partial<Role> = {
            roleName: MOCK_VALID_CREATE_ROLE_PAYLOAD.roleName,
            description: MOCK_VALID_CREATE_ROLE_PAYLOAD.description,
        };

        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockRoleAdminService.createRole.mockResolvedValueOnce(mockCreatedRole as Role);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_ROLE_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('roleName', mockCreatedRole.roleName);
            expect(response.body.description).toEqual(mockCreatedRole.description);
            expect(mockRoleAdminService.createRole).toHaveBeenCalledTimes(1);
        });
    });

    describe(`GET ${BASE_API_PATH}`, () => {
         it('should return 200 OK with a list of roles', async () => {
             const mockRoles = [new Role('role1', 'def1')];
             mockRoleAdminService.listRoles.mockResolvedValueOnce({ items: mockRoles, lastEvaluatedKey: undefined });
             await request(app)
                 .get(BASE_API_PATH)
                 .set(MOCK_AUTH_HEADER)
                 .expect(HttpStatusCode.OK); // 200
             expect(mockRoleAdminService.listRoles).toHaveBeenCalledTimes(1);
             expect(mockRoleAdminService.listRoles).toHaveBeenCalledWith(expect.anything(), { limit: undefined, startKey: undefined });
         });
    });

    describe(`GET ${BASE_API_PATH}/:roleName`, () => {
        const targetRoleName = 'test-role';
        const mockRoleData = new Role(targetRoleName, 'get role');

        it('should return 200 OK with role data if role exists', async () => {
            mockRoleAdminService.getRole.mockResolvedValueOnce(mockRoleData);
            await request(app)
                .get(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK) // 200
                .expect(res => {
                    expect(res.body.roleName).toBe(targetRoleName);
                    expect(res.body.description).toBe('get role');
                });
            expect(mockRoleAdminService.getRole).toHaveBeenCalledWith(expect.anything(), targetRoleName);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockRoleAdminService.getRole.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockRoleAdminService.getRole).toHaveBeenCalledWith(expect.anything(), targetRoleName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${targetRoleName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockRoleAdminService.getRole).not.toHaveBeenCalled();
        });
    });

    describe(`PUT ${BASE_API_PATH}/:roleName`, () => {
        const targetRoleName = 'test-role-to-update';
        const MOCK_VALID_UPDATE_ROLE_PAYLOAD = {
            description: 'Updated Integration Description',
        };
        const updatedRole = new Role(targetRoleName, MOCK_VALID_UPDATE_ROLE_PAYLOAD.description);

        it('should return 200 OK with updated role data if service succeeds', async () => {
            mockRoleAdminService.updateRole.mockResolvedValueOnce(updatedRole);
            await request(app)
                .put(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_ROLE_PAYLOAD)
                .expect(HttpStatusCode.OK) // 200
                .expect(res => {
                    expect(res.body.roleName).toBe(targetRoleName);
                    expect(res.body.description).toBe(MOCK_VALID_UPDATE_ROLE_PAYLOAD.description);
                });
            expect(mockRoleAdminService.updateRole).toHaveBeenCalledWith(expect.anything(), targetRoleName, MOCK_VALID_UPDATE_ROLE_PAYLOAD);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockRoleAdminService.updateRole.mockResolvedValueOnce(null);
            await request(app)
                .put(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_ROLE_PAYLOAD)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockRoleAdminService.updateRole).toHaveBeenCalledWith(expect.anything(), targetRoleName, MOCK_VALID_UPDATE_ROLE_PAYLOAD);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .put(`${BASE_API_PATH}/${targetRoleName}`)
                .send(MOCK_VALID_UPDATE_ROLE_PAYLOAD)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockRoleAdminService.updateRole).not.toHaveBeenCalled();
        });
    });

    describe(`DELETE ${BASE_API_PATH}/:roleName`, () => {
        const targetRoleName = 'test-role-to-delete';

        it('should return 204 No Content if service succeeds', async () => {
            mockRoleAdminService.deleteRole.mockResolvedValueOnce(undefined); // Returns void
            await request(app)
                .delete(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockRoleAdminService.deleteRole).toHaveBeenCalledWith(expect.anything(), targetRoleName);
        });

        it('should return 404 Not Found if service throws RoleNotFoundError', async () => {
            const { RoleNotFoundError } = require('../../../src/domain/exceptions/UserManagementError');
            const notFoundError = new RoleNotFoundError(targetRoleName);
            mockRoleAdminService.deleteRole.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetRoleName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockRoleAdminService.deleteRole).toHaveBeenCalledWith(expect.anything(), targetRoleName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/${targetRoleName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockRoleAdminService.deleteRole).not.toHaveBeenCalled();
        });
    });

    describe(`Permissions Management (${BASE_API_PATH}/:roleName/permissions)`, () => {
        const targetRoleName = 'role-for-permissions';
        const targetPermissionName = 'permission-for-role';

        describe(`POST /:roleName/permissions`, () => {
            it('should return 204 No Content on successful assignment', async () => {
                mockRoleAdminService.assignPermissionToRole.mockResolvedValueOnce(undefined);
                await request(app)
                    .post(`${BASE_API_PATH}/${targetRoleName}/permissions`)
                    .set(MOCK_AUTH_HEADER)
                    .send({ permissionName: targetPermissionName })
                    .expect(HttpStatusCode.NO_CONTENT); // 204
                expect(mockRoleAdminService.assignPermissionToRole).toHaveBeenCalledWith(expect.anything(), targetRoleName, targetPermissionName);
            });
        });

        describe(`DELETE /:roleName/permissions/:permissionName`, () => {
            it('should return 204 No Content on successful removal', async () => {
                mockRoleAdminService.removePermissionFromRole.mockResolvedValueOnce(undefined);
                await request(app)
                    .delete(`${BASE_API_PATH}/${targetRoleName}/permissions/${targetPermissionName}`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.NO_CONTENT); // 204
                expect(mockRoleAdminService.removePermissionFromRole).toHaveBeenCalledWith(expect.anything(), targetRoleName, targetPermissionName);
            });
        });

        describe(`GET /:roleName/permissions`, () => {
            it('should return 200 OK with a list of permission names', async () => {
                const mockPermissions = ['perm1', 'perm2'];
                mockRoleAdminService.listPermissionsForRole.mockResolvedValueOnce(mockPermissions);
                await request(app)
                    .get(`${BASE_API_PATH}/${targetRoleName}/permissions`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.OK) // 200
                    .expect(res => {
                        expect(res.body.permissions).toEqual(mockPermissions);
                    });
                expect(mockRoleAdminService.listPermissionsForRole).toHaveBeenCalledWith(expect.anything(), targetRoleName);
            });
        });
    });
});
