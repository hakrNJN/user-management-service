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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../../../src/app");
const container_1 = require("../../../src/container");
const Permission_1 = require("../../../src/domain/entities/Permission");
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError");
const types_1 = require("../../../src/shared/constants/types");
// --- Mock Service Layer ---
const mockPermissionAdminService = {
    createPermission: jest.fn(),
    getPermission: jest.fn(),
    listPermissions: jest.fn(),
    updatePermission: jest.fn(),
    deletePermission: jest.fn(),
    listRolesForPermission: jest.fn(),
};
// Override container binding BEFORE creating app
container_1.container.register(types_1.TYPES.PermissionAdminService, { useValue: mockPermissionAdminService });
// --- Test Setup ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345'; // From admin.auth.guard
describe('/api/admin/permissions Routes Integration Tests', () => {
    let app;
    beforeAll(() => {
        if (!process.env.DYNAMODB_ENDPOINT_URL || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error("Required DynamoDB test environment variables are not set!");
        }
        // Ensure NODE_ENV is test for bypass token and DI override
        process.env.NODE_ENV = 'test';
        app = (0, app_1.createApp)(); // Create app AFTER overriding service
    });
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
    });
    // --- POST /api/admin/permissions ---
    describe('POST /api/admin/permissions', () => {
        const validPayload = { permissionName: 'perm:create', description: 'Create permission' };
        const createdPerm = new Permission_1.Permission(validPayload.permissionName, validPayload.description);
        it('should return 201 and created permission on success', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.createPermission.mockResolvedValue(createdPerm);
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/permissions')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(201);
            expect(response.body.permissionName).toBe(validPayload.permissionName);
            expect(response.body.description).toBe(validPayload.description);
            expect(mockPermissionAdminService.createPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), // Admin user context
            validPayload);
        }));
        it('should return 400 on validation error (e.g., missing permissionName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidPayload = { description: 'Only description' };
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/permissions')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(invalidPayload);
            expect(response.status).toBe(400);
            expect(response.body.name).toBe('ValidationError');
            expect(response.body.details).toHaveProperty('body.permissionName');
            expect(mockPermissionAdminService.createPermission).not.toHaveBeenCalled();
        }));
        it('should return 409 if permission already exists', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.PermissionExistsError(validPayload.permissionName);
            mockPermissionAdminService.createPermission.mockRejectedValue(error);
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/permissions')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(409);
            expect(response.body.name).toBe('PermissionExistsError');
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/permissions')
                // No Auth header
                .send(validPayload);
            expect(response.status).toBe(401);
        }));
    });
    // --- GET /api/admin/permissions/:permissionName ---
    describe('GET /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:read';
        const existingPerm = new Permission_1.Permission(permName, 'Read permission');
        it('should return 200 and the permission if found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.getPermission.mockResolvedValue(existingPerm);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body.permissionName).toBe(permName);
            expect(mockPermissionAdminService.getPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), permName);
        }));
        it('should return 404 if permission not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.getPermission.mockResolvedValue(null);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/permissions/not-found-perm`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
            // Check based on controller's response or NotFoundError handling in middleware
            expect(response.body.message).toContain('not found');
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).get(`/api/admin/permissions/${permName}`);
            expect(response.status).toBe(401);
        }));
    });
    // --- GET /api/admin/permissions ---
    describe('GET /api/admin/permissions', () => {
        it('should return 200 and list of permissions', () => __awaiter(void 0, void 0, void 0, function* () {
            const permList = [new Permission_1.Permission('p1'), new Permission_1.Permission('p2')];
            const queryResult = { items: permList, lastEvaluatedKey: undefined };
            mockPermissionAdminService.listPermissions.mockResolvedValue(queryResult);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .query({ limit: 10 }); // Example query param
            expect(response.status).toBe(200);
            expect(response.body.items).toHaveLength(2);
            expect(response.body.items[0].permissionName).toBe('p1');
            expect(mockPermissionAdminService.listPermissions).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), { limit: 10, startKey: undefined } // Check options parsing
            );
        }));
        // Add tests for pagination query params if implemented
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).get(`/api/admin/permissions`);
            expect(response.status).toBe(401);
        }));
    });
    // --- PUT /api/admin/permissions/:permissionName ---
    describe('PUT /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:update';
        const validPayload = { description: 'Updated description' };
        const updatedPerm = new Permission_1.Permission(permName, validPayload.description);
        it('should return 200 and updated permission on success', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.updatePermission.mockResolvedValue(updatedPerm);
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(200);
            expect(response.body.permissionName).toBe(permName);
            expect(response.body.description).toBe(validPayload.description);
            expect(mockPermissionAdminService.updatePermission).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), permName, validPayload);
        }));
        it('should return 404 if permission not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.updatePermission.mockResolvedValue(null);
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/permissions/not-found-perm`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(404);
        }));
        it('should return 400 on validation error (e.g., empty body)', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send({}); // Empty body might fail validation
            expect(response.status).toBe(400);
            expect(response.body.name).toBe('ValidationError');
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).put(`/api/admin/permissions/${permName}`).send(validPayload);
            expect(response.status).toBe(401);
        }));
    });
    // --- DELETE /api/admin/permissions/:permissionName ---
    describe('DELETE /api/admin/permissions/:permissionName', () => {
        const permName = 'perm:delete';
        it('should return 204 on successful deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.deletePermission.mockResolvedValue(undefined);
            const response = yield (0, supertest_1.default)(app)
                .delete(`/api/admin/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(204);
            expect(mockPermissionAdminService.deletePermission).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), permName);
        }));
        it('should return 404 if permission not found for deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.PermissionNotFoundError(permName);
            mockPermissionAdminService.deletePermission.mockRejectedValue(error);
            const response = yield (0, supertest_1.default)(app)
                .delete(`/api/admin/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).delete(`/api/admin/permissions/${permName}`);
            expect(response.status).toBe(401);
        }));
    });
    // --- GET /api/admin/permissions/:permissionName/roles ---
    describe('GET /api/admin/permissions/:permissionName/roles', () => {
        const permName = 'perm:with:roles';
        const roles = ['role-a', 'role-b'];
        it('should return 200 and list of role names', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPermissionAdminService.listRolesForPermission.mockResolvedValue(roles);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/permissions/${permName}/roles`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ roles });
            expect(mockPermissionAdminService.listRolesForPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), permName);
        }));
        it('should return 404 if permission is not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.PermissionNotFoundError(permName);
            mockPermissionAdminService.listRolesForPermission.mockRejectedValue(error);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/permissions/${permName}/roles`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).get(`/api/admin/permissions/${permName}/roles`);
            expect(response.status).toBe(401);
        }));
    });
});
