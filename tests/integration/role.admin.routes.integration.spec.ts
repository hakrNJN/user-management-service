// tests/integration/role.admin.routes.integration.spec.ts
import { Express } from 'express';
import 'reflect-metadata';
import request from 'supertest';
import { createApp } from '../../src/app';
import { IRoleAdminService } from '../../src/application/interfaces/IRoleAdminService'; // Correct path
import { container } from '../../src/container';
import { Role } from '../../src/domain/entities/Role';
import { PermissionNotFoundError, RoleExistsError, RoleNotFoundError } from '../../src/domain/exceptions/UserManagementError'; // Correct path
import { TYPES } from '../../src/shared/constants/types';

// --- Mock Service Layer ---
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

// Override container binding BEFORE creating app
container.register<IRoleAdminService>(TYPES.RoleAdminService, { useValue: mockRoleAdminService });

// --- Test Setup ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';

describe('/api/admin/roles Routes Integration Tests', () => {
    let app: Express;

    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        app = createApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- POST /api/admin/roles ---
    describe('POST /api/admin/roles', () => {
        const validPayload = { roleName: 'role:create', description: 'Create role' };
        const createdRole = new Role(validPayload.roleName, validPayload.description);

        it('should return 201 and created role on success', async () => {
            mockRoleAdminService.createRole.mockResolvedValue(createdRole);
            const response = await request(app)
                .post('/api/admin/roles')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);

            expect(response.status).toBe(201);
            expect(response.body.roleName).toBe(validPayload.roleName);
            expect(mockRoleAdminService.createRole).toHaveBeenCalledWith(expect.any(Object), validPayload);
        });

        it('should return 400 on validation error', async () => {
            const response = await request(app)
                .post('/api/admin/roles')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send({ description: 'only desc' }); // Missing roleName
            expect(response.status).toBe(400);
            expect(response.body.name).toBe('ValidationError');
        });

        it('should return 409 if role already exists', async () => {
             mockRoleAdminService.createRole.mockRejectedValue(new RoleExistsError(validPayload.roleName));
             const response = await request(app)
                 .post('/api/admin/roles')
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
             expect(response.status).toBe(409);
        });

        it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).post('/api/admin/roles').send(validPayload);
             expect(response.status).toBe(401);
         });
    });

    // --- GET /api/admin/roles/:roleName ---
    describe('GET /api/admin/roles/:roleName', () => {
        const roleName = 'role:read';
        const existingRole = new Role(roleName);

        it('should return 200 and the role if found', async () => {
            mockRoleAdminService.getRole.mockResolvedValue(existingRole);
            const response = await request(app)
                .get(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body.roleName).toBe(roleName);
            expect(mockRoleAdminService.getRole).toHaveBeenCalledWith(expect.any(Object), roleName);
        });

         it('should return 404 if role not found', async () => {
             mockRoleAdminService.getRole.mockResolvedValue(null);
             const response = await request(app)
                 .get(`/api/admin/roles/not-found-role`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
         });

         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`/api/admin/roles/${roleName}`);
             expect(response.status).toBe(401);
         });
    });

     // --- GET /api/admin/roles ---
     describe('GET /api/admin/roles', () => {
        it('should return 200 and list of roles', async () => {
            const roleList = [new Role('r1'), new Role('r2')];
            const queryResult = { items: roleList, lastEvaluatedKey: undefined };
             mockRoleAdminService.listRoles.mockResolvedValue(queryResult);

             const response = await request(app)
                 .get(`/api/admin/roles`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(200);
             expect(response.body.items).toHaveLength(2);
             expect(mockRoleAdminService.listRoles).toHaveBeenCalled();
        });
        // Add auth test
    });

     // --- PUT /api/admin/roles/:roleName ---
    describe('PUT /api/admin/roles/:roleName', () => {
         const roleName = 'role:update';
         const validPayload = { description: 'Updated description role' };
         const updatedRole = new Role(roleName, validPayload.description);

         it('should return 200 and updated role on success', async () => {
             mockRoleAdminService.updateRole.mockResolvedValue(updatedRole);
             const response = await request(app)
                 .put(`/api/admin/roles/${roleName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);

             expect(response.status).toBe(200);
             expect(response.body.description).toBe(validPayload.description);
             expect(mockRoleAdminService.updateRole).toHaveBeenCalledWith(expect.any(Object), roleName, validPayload);
         });

          it('should return 404 if role not found for update', async () => {
             mockRoleAdminService.updateRole.mockResolvedValue(null);
             const response = await request(app)
                 .put(`/api/admin/roles/not-found-role`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
             expect(response.status).toBe(404);
         });

         it('should return 400 on validation error', async () => {
              const response = await request(app)
                 .put(`/api/admin/roles/${roleName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send({});
              expect(response.status).toBe(400);
         });
         // Add auth test
    });

    // --- DELETE /api/admin/roles/:roleName ---
    describe('DELETE /api/admin/roles/:roleName', () => {
        const roleName = 'role:delete';

        it('should return 204 on successful deletion', async () => {
             mockRoleAdminService.deleteRole.mockResolvedValue(undefined);
             const response = await request(app)
                 .delete(`/api/admin/roles/${roleName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(204);
             expect(mockRoleAdminService.deleteRole).toHaveBeenCalledWith(expect.any(Object), roleName);
        });

         it('should return 404 if role not found for deletion', async () => {
             mockRoleAdminService.deleteRole.mockRejectedValue(new RoleNotFoundError(roleName));
             const response = await request(app)
                 .delete(`/api/admin/roles/${roleName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
         });
        // Add auth test
    });

    // --- Role <-> Permission Assignments ---
    describe('POST /api/admin/roles/:roleName/permissions', () => {
        const roleName = 'role-assign';
        const validPayload = { permissionName: 'perm-assign' };

        it('should return 200 on successful assignment', async () => {
            mockRoleAdminService.assignPermissionToRole.mockResolvedValue(undefined);
             const response = await request(app)
                 .post(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);

            expect(response.status).toBe(200); // Controller returns 200 OK with message
            expect(response.body.message).toContain('assigned');
            expect(mockRoleAdminService.assignPermissionToRole).toHaveBeenCalledWith(expect.any(Object), roleName, validPayload.permissionName);
        });

        it('should return 404 if role not found', async () => {
             mockRoleAdminService.assignPermissionToRole.mockRejectedValue(new RoleNotFoundError(roleName));
              const response = await request(app)
                 .post(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
              expect(response.status).toBe(404);
        });

        it('should return 404 if permission not found', async () => {
            mockRoleAdminService.assignPermissionToRole.mockRejectedValue(new PermissionNotFoundError(validPayload.permissionName));
             const response = await request(app)
                 .post(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
             expect(response.status).toBe(404);
        });

         it('should return 400 on validation error', async () => {
             const response = await request(app)
                 .post(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send({}); // Missing permissionName
             expect(response.status).toBe(400);
         });
        // Add auth test
    });

    describe('DELETE /api/admin/roles/:roleName/permissions/:permissionName', () => {
         const roleName = 'role-unassign';
         const permName = 'perm-unassign';

         it('should return 204 on successful unassignment', async () => {
            mockRoleAdminService.removePermissionFromRole.mockResolvedValue(undefined);
            const response = await request(app)
                 .delete(`/api/admin/roles/${roleName}/permissions/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(204);
            expect(mockRoleAdminService.removePermissionFromRole).toHaveBeenCalledWith(expect.any(Object), roleName, permName);
         });
         // Add auth test
         // Add test for service layer error (e.g. 500)
    });

     describe('GET /api/admin/roles/:roleName/permissions', () => {
        const roleName = 'role-list-perms';
        const permissions = ['perm-listed-1', 'perm-listed-2'];

         it('should return 200 and list of permission names', async () => {
             mockRoleAdminService.listPermissionsForRole.mockResolvedValue(permissions);
             const response = await request(app)
                 .get(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(200);
             expect(response.body).toEqual({ permissions });
             expect(mockRoleAdminService.listPermissionsForRole).toHaveBeenCalledWith(expect.any(Object), roleName);
         });

          it('should return 404 if role not found', async () => {
             mockRoleAdminService.listPermissionsForRole.mockRejectedValue(new RoleNotFoundError(roleName));
             const response = await request(app)
                 .get(`/api/admin/roles/${roleName}/permissions`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
         });
        // Add auth test
    });

});