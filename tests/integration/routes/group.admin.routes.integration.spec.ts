// tests/integration/group.admin.routes.spec.ts

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
import { Group } from '../../../src/domain/entities/Group';
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger';
import { TYPES } from '../../../src/shared/constants/types';
import { mockConfigService } from '../../mocks/config.mock';
import { JwtValidator } from '../../../src/shared/utils/jwtValidator';

// --- Mock Service Layer ---
const mockGroupAdminService: jest.Mocked<IGroupAdminService> = {
    createGroup: jest.fn(),
    getGroup: jest.fn(),
    listGroups: jest.fn(),
    deleteGroup: jest.fn(),
    reactivateGroup: jest.fn(),
    assignRoleToGroup: jest.fn(),
    removeRoleFromGroup: jest.fn(),
    listRolesForGroup: jest.fn(),
};
const mockPermissionAdminService: jest.Mocked<IPermissionAdminService> = {
    createPermission: jest.fn(),
    getPermission: jest.fn(),
    listPermissions: jest.fn(),
    updatePermission: jest.fn(),
    deletePermission: jest.fn(),
    listRolesForPermission: jest.fn(),
};
const mockPolicyAdminService: jest.Mocked<IPolicyAdminService> = {
    createPolicy: jest.fn(),
    getPolicy: jest.fn(),
    listPolicies: jest.fn(),
    updatePolicy: jest.fn(),
    deletePolicy: jest.fn(),
    getPolicyVersion: jest.fn(),
    listPolicyVersions: jest.fn(),
    rollbackPolicy: jest.fn(),
};
const mockRoleAdminService: jest.Mocked<IRoleAdminService> = {
    createRole: jest.fn(),
    getRole: jest.fn(),
    listRoles: jest.fn(),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    assignPermissionToRole: jest.fn(),
    removePermissionFromRole: jest.fn(),
    listPermissionsForRole: jest.fn(),
};
const mockUserAdminService: jest.Mocked<IUserAdminService> = {
    createUser: jest.fn(),
    listUsers: jest.fn(),
    getUser: jest.fn(),
    updateUserAttributes: jest.fn(),
    deleteUser: jest.fn(),
    disableUser: jest.fn(),
    enableUser: jest.fn(),
    initiatePasswordReset: jest.fn(),
    setUserPassword: jest.fn(),
    addUserToGroup: jest.fn(),
    removeUserFromGroup: jest.fn(),
    listGroupsForUser: jest.fn(),
    listUsersInGroup: jest.fn(),
    updateUserGroups: jest.fn(),
};
// Workaround for strange TS error
const mockPolicyService = {
    getPolicy: jest.fn(),
    listPolicies: jest.fn(),
};

// --- Pre-emptive DI Container Setup ---
process.env.NODE_ENV = 'test';
container.reset();
const mockJwtValidator = {
    validate: jest.fn().mockResolvedValue({ 
        sub: 'test-admin-id-123', 
        'cognito:username': 'test-admin',
        'cognito:groups': ['group-admin', 'user'],
    }),
};
container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
container.register<JwtValidator>(TYPES.JwtValidator, { useValue: mockJwtValidator });
container.register<IGroupAdminService>(TYPES.GroupAdminService, { useValue: mockGroupAdminService });
container.register<IPermissionAdminService>(TYPES.PermissionAdminService, { useValue: mockPermissionAdminService });
container.register<IPolicyAdminService>(TYPES.PolicyAdminService, { useValue: mockPolicyAdminService });
container.register<IRoleAdminService>(TYPES.RoleAdminService, { useValue: mockRoleAdminService });
container.register<IUserAdminService>(TYPES.UserAdminService, { useValue: mockUserAdminService });
container.register<IPolicyService>(TYPES.PolicyService, { useValue: mockPolicyService as any });


// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const BASE_API_PATH = '/api/admin/groups';

const MOCK_VALID_CREATE_GROUP_PAYLOAD = {
    groupName: `Test-Group-${Date.now()}`,
    description: 'Integration Test Group Description',
    precedence: 10,
};

// --- Test Suite ---
describe(`Integration Tests: Group Admin Routes (${BASE_API_PATH})`, () => {
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
        const mockCreatedGroup: Partial<Group> = {
            groupName: MOCK_VALID_CREATE_GROUP_PAYLOAD.groupName,
            description: MOCK_VALID_CREATE_GROUP_PAYLOAD.description,
            creationDate: new Date(),
            lastModifiedDate: new Date(),
        };

        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockGroupAdminService.createGroup.mockResolvedValueOnce(mockCreatedGroup as Group);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
               .expect('Content-Type', /json/);

               expect(response.body).toHaveProperty('groupName', mockCreatedGroup.groupName);
               expect(response.body.description).toEqual(mockCreatedGroup.description);
            expect(mockGroupAdminService.createGroup).toHaveBeenCalledTimes(1);
        });

        it('should return 400 Bad Request if validation fails (e.g., missing groupName)', async () => {
            const invalidPayload = { description: 'Only desc' }; // Missing groupName
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode.BAD_REQUEST); // 400

            expect(mockGroupAdminService.createGroup).not.toHaveBeenCalled();
        });

        it('should return 409 Conflict if service throws GroupExistsError', async () => {
            const { GroupExistsError } = require('../../../src/domain/exceptions/UserManagementError');
            const conflictError = new GroupExistsError('Group exists');
            mockGroupAdminService.createGroup.mockRejectedValueOnce(conflictError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode.CONFLICT); // 409
            expect(mockGroupAdminService.createGroup).toHaveBeenCalledTimes(1);
        });

        it('should return 500 Internal Server Error if service throws an unexpected error', async () => {
            const genericError = new Error('DB connection failed');
            mockGroupAdminService.createGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminService.createGroup).toHaveBeenCalledTimes(1);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(BASE_API_PATH)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminService.listGroups).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Get-Group-Test';
        const mockGroupData: Partial<Group> = { groupName: targetgroupName, description: 'Details...' };

        it('should return 200 OK with group data if group exists', async () => {
            mockGroupAdminService.getGroup.mockResolvedValueOnce(mockGroupData as Group);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockGroupAdminService.getGroup.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404 (Handled by controller)
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 404 Not Found if service throws NotFoundError', async () => {
            const { NotFoundError } = require('../../../src/shared/errors/BaseError');
            const notFoundError = new NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminService.getGroup.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404 (Handled by error middleware)
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 400 Bad Request if groupName param is invalid', async () => {
            const invalidgroupName = 'Invalid Group Name With Spaces'; // Assuming schema disallows spaces
            await request(app)
                .get(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`) // URL encode it
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockGroupAdminService.getGroup).not.toHaveBeenCalled();
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('Cannot get group');
            mockGroupAdminService.getGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminService.getGroup).not.toHaveBeenCalled();
        });
    });

    describe(`DELETE ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Delete-Group-Test';

        it('should return 204 No Content if service succeeds', async () => {
            mockGroupAdminService.deleteGroup.mockResolvedValueOnce(undefined);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 404 Not Found if service throws NotFoundError', async () => {
            const { NotFoundError } = require('../../../src/shared/errors/BaseError');
            const notFoundError = new NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminService.deleteGroup.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 400 Bad Request if groupName param is invalid', async () => {
            const invalidgroupName = 'Invalid Chars $';
            await request(app)
                .delete(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockGroupAdminService.deleteGroup).not.toHaveBeenCalled();
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Cannot delete group');
            mockGroupAdminService.deleteGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminService.deleteGroup).not.toHaveBeenCalled();
        });
    });
});
