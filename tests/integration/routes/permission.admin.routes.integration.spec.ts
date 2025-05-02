// tests/integration/permission.admin.routes.integration.spec.ts
import { Express } from 'express';
import 'reflect-metadata';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { IPermissionAdminService } from '../../../src/application/interfaces/IPermissionAdminService';
import { container } from '../../../src/container';
import { Permission } from '../../../src/domain/entities/Permission';
import { PermissionExistsError, PermissionNotFoundError } from '../../../src/domain/exceptions/UserManagementError';
import { TYPES } from '../../../src/shared/constants/types';

// --- Mock Service Layer ---
const mockPermissionAdminService: jest.Mocked<IPermissionAdminService> = {
    createPermission: jest.fn(),
    getPermission: jest.fn(),
    listPermissions: jest.fn(),
    updatePermission: jest.fn(),
    deletePermission: jest.fn(),
    listRolesForPermission: jest.fn(),
};

// Override container binding BEFORE creating app
container.register<IPermissionAdminService>(TYPES.PermissionAdminService, { useValue: mockPermissionAdminService });

// --- Test Setup ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345'; // From admin.auth.guard

describe('/api/admin/permissions Routes Integration Tests', () => {
    let app: Express;

    beforeAll(() => {
        if (!process.env.DYNAMODB_ENDPOINT_URL || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error("Required DynamoDB test environment variables are not set!");
        }
        // Ensure NODE_ENV is test for bypass token and DI override
        process.env.NODE_ENV = 'test';
        app = createApp(); // Create app AFTER overriding service
    });

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
    });

    // --- POST /api/admin/permissions ---
    describe('POST /api/admin/permissions', () => {
        const validPayload = { permissionName: 'perm:create', description: 'Create permission' };
        const createdPerm = new Permission(validPayload.permissionName, validPayload.description);

        it('should return 201 and created permission on success', async () => {
            mockPermissionAdminService.createPermission.mockResolvedValue(createdPerm);

            const response = await request(app)
                .post('/api/admin/permissions')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);

            expect(response.status).toBe(201);
            expect(response.body.permissionName).toBe(validPayload.permissionName);
            expect(response.body.description).toBe(validPayload.description);
            expect(mockPermissionAdminService.createPermission).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'test-admin-id-123' }), // Admin user context
                validPayload
            );
        });

        it('should return 400 on validation error (e.g., missing permissionName)', async () => {
             const invalidPayload = { description: 'Only description' };
             const response = await request(app)
                .post('/api/admin/permissions')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(invalidPayload);

             expect(response.status).toBe(400);
             expect(response.body.name).toBe('ValidationError');
             expect(response.body.details).toHaveProperty('body.permissionName');
             expect(mockPermissionAdminService.createPermission).not.toHaveBeenCalled();
        });

         it('should return 409 if permission already exists', async () => {
             const error = new PermissionExistsError(validPayload.permissionName);
             mockPermissionAdminService.createPermission.mockRejectedValue(error);

             const response = await request(app)
                 .post('/api/admin/permissions')
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);

             expect(response.status).toBe(409);
             expect(response.body.name).toBe('PermissionExistsError');
         });

         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app)
                 .post('/api/admin/permissions')
                 // No Auth header
                 .send(validPayload);
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
                 .get(`/api/admin/permissions/${permName}`)
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
                 .get(`/api/admin/permissions/not-found-perm`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(404);
             // Check based on controller's response or NotFoundError handling in middleware
             expect(response.body.message).toContain('not found');
         });

          it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`/api/admin/permissions/${permName}`);
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
                 .get(`/api/admin/permissions`)
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
             const response = await request(app).get(`/api/admin/permissions`);
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
                 .put(`/api/admin/permissions/${permName}`)
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
                 .put(`/api/admin/permissions/not-found-perm`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send(validPayload);
             expect(response.status).toBe(404);
         });

         it('should return 400 on validation error (e.g., empty body)', async () => {
             const response = await request(app)
                 .put(`/api/admin/permissions/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN)
                 .send({}); // Empty body might fail validation
             expect(response.status).toBe(400);
             expect(response.body.name).toBe('ValidationError');
         });
          it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).put(`/api/admin/permissions/${permName}`).send(validPayload);
             expect(response.status).toBe(401);
         });
    });

    // --- DELETE /api/admin/permissions/:permissionName ---
    describe('DELETE /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:delete';

        it('should return 204 on successful deletion', async () => {
             mockPermissionAdminService.deletePermission.mockResolvedValue(undefined);
             const response = await request(app)
                 .delete(`/api/admin/permissions/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(204);
             expect(mockPermissionAdminService.deletePermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName
             );
        });

         it('should return 404 if permission not found for deletion', async () => {
             const error = new PermissionNotFoundError(permName);
             mockPermissionAdminService.deletePermission.mockRejectedValue(error);
             const response = await request(app)
                 .delete(`/api/admin/permissions/${permName}`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
         });

         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).delete(`/api/admin/permissions/${permName}`);
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
                 .get(`/api/admin/permissions/${permName}/roles`)
                 .set('Authorization', TEST_ADMIN_TOKEN);

             expect(response.status).toBe(200);
             expect(response.body).toEqual({ roles });
             expect(mockPermissionAdminService.listRolesForPermission).toHaveBeenCalledWith(
                 expect.objectContaining({ id: 'test-admin-id-123' }),
                 permName
             );
        });

        it('should return 404 if permission is not found', async () => {
            const error = new PermissionNotFoundError(permName);
            mockPermissionAdminService.listRolesForPermission.mockRejectedValue(error);
             const response = await request(app)
                 .get(`/api/admin/permissions/${permName}/roles`)
                 .set('Authorization', TEST_ADMIN_TOKEN);
             expect(response.status).toBe(404);
        });
         it('should return 401 if token is invalid/missing', async () => {
             const response = await request(app).get(`/api/admin/permissions/${permName}/roles`);
             expect(response.status).toBe(401);
         });
    });

});