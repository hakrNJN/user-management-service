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
const Role_1 = require("../../../src/domain/entities/Role");
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError"); // Correct path
const types_1 = require("../../../src/shared/constants/types");
// --- Mock Service Layer ---
const mockRoleAdminService = {
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
container_1.container.register(types_1.TYPES.RoleAdminService, { useValue: mockRoleAdminService });
// --- Test Setup ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
describe('/api/admin/roles Routes Integration Tests', () => {
    let app;
    beforeAll(() => {
        if (!process.env.DYNAMODB_ENDPOINT_URL || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error("Required DynamoDB test environment variables are not set!");
        }
        process.env.NODE_ENV = 'test';
        app = (0, app_1.createApp)();
    });
    beforeEach(() => {
        jest.clearAllMocks();
    });
    // --- POST /api/admin/roles ---
    describe('POST /api/admin/roles', () => {
        const validPayload = { roleName: 'role:create', description: 'Create role' };
        const createdRole = new Role_1.Role(validPayload.roleName, validPayload.description);
        it('should return 201 and created role on success', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.createRole.mockResolvedValue(createdRole);
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/roles')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(201);
            expect(response.body.roleName).toBe(validPayload.roleName);
            expect(mockRoleAdminService.createRole).toHaveBeenCalledWith(expect.any(Object), validPayload);
        }));
        it('should return 400 on validation error', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/roles')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send({ description: 'only desc' }); // Missing roleName
            expect(response.status).toBe(400);
            expect(response.body.name).toBe('ValidationError');
        }));
        it('should return 409 if role already exists', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.createRole.mockRejectedValue(new UserManagementError_1.RoleExistsError(validPayload.roleName));
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/roles')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(409);
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).post('/api/admin/roles').send(validPayload);
            expect(response.status).toBe(401);
        }));
    });
    // --- GET /api/admin/roles/:roleName ---
    describe('GET /api/admin/roles/:roleName', () => {
        const roleName = 'role:read';
        const existingRole = new Role_1.Role(roleName);
        it('should return 200 and the role if found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.getRole.mockResolvedValue(existingRole);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body.roleName).toBe(roleName);
            expect(mockRoleAdminService.getRole).toHaveBeenCalledWith(expect.any(Object), roleName);
        }));
        it('should return 404 if role not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.getRole.mockResolvedValue(null);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/roles/not-found-role`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
        }));
        it('should return 401 if token is invalid/missing', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app).get(`/api/admin/roles/${roleName}`);
            expect(response.status).toBe(401);
        }));
    });
    // --- GET /api/admin/roles ---
    describe('GET /api/admin/roles', () => {
        it('should return 200 and list of roles', () => __awaiter(void 0, void 0, void 0, function* () {
            const roleList = [new Role_1.Role('r1'), new Role_1.Role('r2')];
            const queryResult = { items: roleList, lastEvaluatedKey: undefined };
            mockRoleAdminService.listRoles.mockResolvedValue(queryResult);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/roles`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body.items).toHaveLength(2);
            expect(mockRoleAdminService.listRoles).toHaveBeenCalled();
        }));
        // Add auth test
    });
    // --- PUT /api/admin/roles/:roleName ---
    describe('PUT /api/admin/roles/:roleName', () => {
        const roleName = 'role:update';
        const validPayload = { description: 'Updated description role' };
        const updatedRole = new Role_1.Role(roleName, validPayload.description);
        it('should return 200 and updated role on success', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.updateRole.mockResolvedValue(updatedRole);
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(200);
            expect(response.body.description).toBe(validPayload.description);
            expect(mockRoleAdminService.updateRole).toHaveBeenCalledWith(expect.any(Object), roleName, validPayload);
        }));
        it('should return 404 if role not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.updateRole.mockResolvedValue(null);
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/roles/not-found-role`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(404);
        }));
        it('should return 400 on validation error', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .put(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send({});
            expect(response.status).toBe(400);
        }));
        // Add auth test
    });
    // --- DELETE /api/admin/roles/:roleName ---
    describe('DELETE /api/admin/roles/:roleName', () => {
        const roleName = 'role:delete';
        it('should return 204 on successful deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.deleteRole.mockResolvedValue(undefined);
            const response = yield (0, supertest_1.default)(app)
                .delete(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(204);
            expect(mockRoleAdminService.deleteRole).toHaveBeenCalledWith(expect.any(Object), roleName);
        }));
        it('should return 404 if role not found for deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.deleteRole.mockRejectedValue(new UserManagementError_1.RoleNotFoundError(roleName));
            const response = yield (0, supertest_1.default)(app)
                .delete(`/api/admin/roles/${roleName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
        }));
        // Add auth test
    });
    // --- Role <-> Permission Assignments ---
    describe('POST /api/admin/roles/:roleName/permissions', () => {
        const roleName = 'role-assign';
        const validPayload = { permissionName: 'perm-assign' };
        it('should return 200 on successful assignment', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.assignPermissionToRole.mockResolvedValue(undefined);
            const response = yield (0, supertest_1.default)(app)
                .post(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(200); // Controller returns 200 OK with message
            expect(response.body.message).toContain('assigned');
            expect(mockRoleAdminService.assignPermissionToRole).toHaveBeenCalledWith(expect.any(Object), roleName, validPayload.permissionName);
        }));
        it('should return 404 if role not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.assignPermissionToRole.mockRejectedValue(new UserManagementError_1.RoleNotFoundError(roleName));
            const response = yield (0, supertest_1.default)(app)
                .post(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(404);
        }));
        it('should return 404 if permission not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.assignPermissionToRole.mockRejectedValue(new UserManagementError_1.PermissionNotFoundError(validPayload.permissionName));
            const response = yield (0, supertest_1.default)(app)
                .post(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(validPayload);
            expect(response.status).toBe(404);
        }));
        it('should return 400 on validation error', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .post(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send({}); // Missing permissionName
            expect(response.status).toBe(400);
        }));
        // Add auth test
    });
    describe('DELETE /api/admin/roles/:roleName/permissions/:permissionName', () => {
        const roleName = 'role-unassign';
        const permName = 'perm-unassign';
        it('should return 204 on successful unassignment', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.removePermissionFromRole.mockResolvedValue(undefined);
            const response = yield (0, supertest_1.default)(app)
                .delete(`/api/admin/roles/${roleName}/permissions/${permName}`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(204);
            expect(mockRoleAdminService.removePermissionFromRole).toHaveBeenCalledWith(expect.any(Object), roleName, permName);
        }));
        // Add auth test
        // Add test for service layer error (e.g. 500)
    });
    describe('GET /api/admin/roles/:roleName/permissions', () => {
        const roleName = 'role-list-perms';
        const permissions = ['perm-listed-1', 'perm-listed-2'];
        it('should return 200 and list of permission names', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.listPermissionsForRole.mockResolvedValue(permissions);
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ permissions });
            expect(mockRoleAdminService.listPermissionsForRole).toHaveBeenCalledWith(expect.any(Object), roleName);
        }));
        it('should return 404 if role not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRoleAdminService.listPermissionsForRole.mockRejectedValue(new UserManagementError_1.RoleNotFoundError(roleName));
            const response = yield (0, supertest_1.default)(app)
                .get(`/api/admin/roles/${roleName}/permissions`)
                .set('Authorization', TEST_ADMIN_TOKEN);
            expect(response.status).toBe(404);
        }));
        // Add auth test
    });
});
