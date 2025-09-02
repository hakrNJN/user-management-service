// tests/integration/routes/system.routes.integration.spec.ts
import { Express } from 'express';
import 'reflect-metadata';
import request from 'supertest';

// --- Application Imports ---
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { IGroupAdminService } from '../../../src/application/interfaces/IGroupAdminService';
import { ILogger } from '../../../src/application/interfaces/ILogger';
import { IPermissionAdminService } from '../../../src/application/interfaces/IPermissionAdminService';
import { IPolicyAdminService } from '../../../src/application/interfaces/IPolicyAdminService';
import { IPolicyService } from '../../../src/application/interfaces/IPolicyService';
import { IRoleAdminService } from '../../../src/application/interfaces/IRoleAdminService';
import { IUserAdminService } from '../../../src/application/interfaces/IUserAdminService';
import { container } from '../../../src/container';
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

// --- Test Suite ---
describe('Integration Tests: System Routes (/api/system)', () => {
    let app: Express;

    beforeAll(() => {
        const { createApp } = require('../../../src/app');
        app = createApp();
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
    });

    describe('GET /api/system/health', () => {
        it('should return 200 OK with status UP', async () => {
            const response = await request(app)
                .get('/api/system/health')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('status', 'UP');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /api/system/server-info', () => {
        it('should return 200 OK with server info', async () => {
            const response = await request(app)
                .get('/api/system/server-info')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('environment', 'test');
            expect(response.body).toHaveProperty('nodeVersion');
            expect(response.body).toHaveProperty('os');
            expect(response.body.os).toHaveProperty('platform');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /api/system/metrics', () => {
        it('should return 200 OK with prometheus metrics', async () => {
            const response = await request(app)
                .get('/api/system/metrics')
                .expect('Content-Type', /text\/plain/)
                .expect(200);

            expect(response.text).toMatch(/^# HELP/);
        });
    });

    describe('GET /api/non-existent-route', () => {
        it('should return 404 Not Found', async () => {
            const response = await request(app)
                .get('/api/non-existent-route')
                .expect('Content-Type', /json/)
                .expect(404);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'NotFoundError');
            expect(response.body.message).toContain('was not found');
        });
    });
});