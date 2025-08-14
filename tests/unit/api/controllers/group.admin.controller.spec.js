"use strict";
// tests/unit/api/controllers/group.admin.controller.spec.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const group_admin_controller_1 = require("../../../../src/api/controllers/group.admin.controller");
const HttpStatusCode_1 = require("../../../../src/application/enums/HttpStatusCode");
const container_1 = require("../../../../src/container"); // Use actual container if needed, or mock service directly
const Group_1 = require("../../../../src/domain/entities/Group");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError");
const types_1 = require("../../../../src/shared/constants/types");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock"); // Mock admin user
const logger_mock_1 = require("../../../mocks/logger.mock"); // Mock logger
// --- Mock the Service Layer ---
const mockGroupAdminService = {
    createGroup: jest.fn(),
    getGroup: jest.fn(),
    listGroups: jest.fn(),
    deleteGroup: jest.fn(),
    reactivateGroup: jest.fn(),
    assignRoleToGroup: jest.fn(), // Added
    removeRoleFromGroup: jest.fn(), // Added
    listRolesForGroup: jest.fn(), // Added
};
describe('GroupAdminController', () => {
    let controller;
    let mockRequest;
    let mockResponse;
    let mockNext;
    let mockStatus;
    let mockJson;
    let mockSend;
    beforeAll(() => {
        // Register the mock service implementation in the container
        // Do this ONLY if the controller resolves the service via the container
        // If service is passed via constructor, just pass the mock directly below
        container_1.container.register(types_1.TYPES.GroupAdminService, { useValue: mockGroupAdminService });
        container_1.container.register(types_1.TYPES.Logger, { useValue: logger_mock_1.mockLogger }); // Ensure logger is mocked too
    });
    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mocks
        // Resolve controller instance (if using container)
        // controller = container.resolve(GroupAdminController);
        // OR Instantiate controller directly with mocks (if not using container resolution in test)
        controller = new group_admin_controller_1.GroupAdminController(mockGroupAdminService, logger_mock_1.mockLogger);
        // Mock Express objects
        mockRequest = {
            adminUser: Object.assign({}, adminUser_mock_1.mockAdminUser), // Attach mock admin user
            body: {},
            params: {},
            query: {},
        };
        mockJson = jest.fn();
        mockSend = jest.fn();
        mockStatus = jest.fn(() => ({ json: mockJson, send: mockSend })); // Chain status().json() or status().send()
        mockResponse = {
            status: mockStatus,
        };
        mockNext = jest.fn();
    });
    // --- POST /admin/groups ---
    describe('createGroup', () => {
        const groupDetails = { groupName: 'test-group', description: 'Test group' };
        const createdGroup = new Group_1.Group('test-group', 'Test group', 'ACTIVE', undefined, new Date(), new Date());
        it('should call service createGroup and return 201 with group data', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = groupDetails;
            mockGroupAdminService.createGroup.mockResolvedValue(createdGroup);
            yield controller.createGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.createGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupDetails);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.CREATED);
            expect(mockJson).toHaveBeenCalledWith(createdGroup);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service throws GroupExistsError', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = groupDetails;
            const error = new UserManagementError_1.GroupExistsError(groupDetails.groupName);
            mockGroupAdminService.createGroup.mockRejectedValue(error);
            yield controller.createGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.createGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupDetails);
            expect(mockStatus).not.toHaveBeenCalled();
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        it('should call next with error if adminUser is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.adminUser = undefined; // Simulate missing admin user
            mockRequest.body = groupDetails;
            // Controller throws directly if adminUser is missing
            yield expect(controller.createGroup(mockRequest, mockResponse, mockNext))
                .rejects.toThrow(BaseError_1.BaseError); // Controller's internal check throws
            // Check the error properties if needed
            try {
                yield controller.createGroup(mockRequest, mockResponse, mockNext);
            }
            catch (e) {
                expect(e.statusCode).toBe(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR);
                expect(e.message).toContain('Admin context missing');
            }
            expect(mockGroupAdminService.createGroup).not.toHaveBeenCalled();
            expect(mockNext).not.toHaveBeenCalled(); // Error is thrown before next is called
        }));
    });
    // --- GET /admin/groups/:groupName ---
    describe('getGroup', () => {
        const groupName = 'get-this-group';
        const foundGroup = new Group_1.Group(groupName, 'Desc', 'ACTIVE', undefined, new Date(), new Date());
        it('should call service getGroup and return 200 with group data if found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockGroupAdminService.getGroup.mockResolvedValue(foundGroup);
            yield controller.getGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith(foundGroup);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with NotFoundError if service returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName: 'not-found-group' };
            mockGroupAdminService.getGroup.mockResolvedValue(null);
            yield controller.getGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, 'not-found-group');
            expect(mockStatus).not.toHaveBeenCalled();
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError_1.BaseError));
            expect(mockNext.mock.calls[0][0].statusCode).toBe(HttpStatusCode_1.HttpStatusCode.NOT_FOUND);
            expect(mockNext.mock.calls[0][0].name).toBe('NotFoundError');
        }));
        it('should call next with error if service throws', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            const error = new Error('Service failed');
            mockGroupAdminService.getGroup.mockRejectedValue(error);
            yield controller.getGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- GET /admin/groups ---
    describe('listGroups', () => {
        const now = new Date(); // Helper date
        const mockGroups = [
            // Provide all 5 arguments for each Group instance
            new Group_1.Group('g1', 'Group One Description', 'ACTIVE', 10, now, now),
            new Group_1.Group('g2', '', 'ACTIVE', undefined, now, now) // Use undefined for optional args
        ];
        const mockResult = { groups: mockGroups, nextToken: 'tok1' };
        it('should call service listGroups and return 200 with result', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.query = { limit: '10', nextToken: 'start' };
            mockGroupAdminService.listGroups.mockResolvedValue(mockResult);
            yield controller.listGroups(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.listGroups).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, 10, 'start');
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith(mockResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should handle missing query params', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.query = {};
            mockGroupAdminService.listGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            yield controller.listGroups(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.listGroups).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, undefined, undefined);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
        }));
        it('should call next with error if service throws', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failed');
            mockGroupAdminService.listGroups.mockRejectedValue(error);
            yield controller.listGroups(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- DELETE /admin/groups/:groupName ---
    describe('deleteGroup', () => {
        const groupName = 'delete-this-group';
        it('should call service deleteGroup and return 204 No Content', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockGroupAdminService.deleteGroup.mockResolvedValue(undefined);
            yield controller.deleteGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NO_CONTENT);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with GroupNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            const error = new UserManagementError_1.GroupNotFoundError(groupName);
            mockGroupAdminService.deleteGroup.mockRejectedValue(error);
            yield controller.deleteGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName);
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockStatus).not.toHaveBeenCalled();
        }));
        it('should call next with CleanupFailedError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            const error = new BaseError_1.BaseError('CleanupFailedError', 500, 'Cleanup failed');
            mockGroupAdminService.deleteGroup.mockRejectedValue(error);
            yield controller.deleteGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- NEW: POST /admin/groups/:groupName/roles ---
    describe('assignRoleToGroup', () => {
        const groupName = 'assign-role-group';
        const roleName = 'role-to-assign';
        const payload = { roleName };
        it('should call service assignRoleToGroup and return 200 with message', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            mockGroupAdminService.assignRoleToGroup.mockResolvedValue(undefined);
            yield controller.assignRoleToGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.assignRoleToGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName, roleName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith({ message: expect.stringContaining('assigned to group') });
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with GroupNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new UserManagementError_1.GroupNotFoundError(groupName);
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            yield controller.assignRoleToGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        it('should call next with RoleNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new UserManagementError_1.RoleNotFoundError(roleName);
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            yield controller.assignRoleToGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        it('should call next with AssignmentError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new UserManagementError_1.AssignmentError('Assign failed');
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            yield controller.assignRoleToGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- NEW: DELETE /admin/groups/:groupName/roles/:roleName ---
    describe('removeRoleFromGroup', () => {
        const groupName = 'remove-role-group';
        const roleName = 'role-to-remove';
        it('should call service removeRoleFromGroup and return 204 No Content', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName, roleName };
            mockGroupAdminService.removeRoleFromGroup.mockResolvedValue(undefined);
            yield controller.removeRoleFromGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.removeRoleFromGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName, roleName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NO_CONTENT);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with AssignmentError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName, roleName };
            const error = new UserManagementError_1.AssignmentError('Remove failed');
            mockGroupAdminService.removeRoleFromGroup.mockRejectedValue(error);
            yield controller.removeRoleFromGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- NEW: GET /admin/groups/:groupName/roles ---
    describe('listRolesForGroup', () => {
        const groupName = 'list-roles-group';
        const roles = ['roleA', 'roleB'];
        it('should call service listRolesForGroup and return 200 with roles', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            mockGroupAdminService.listRolesForGroup.mockResolvedValue(roles);
            yield controller.listRolesForGroup(mockRequest, mockResponse, mockNext);
            expect(mockGroupAdminService.listRolesForGroup).toHaveBeenCalledWith(adminUser_mock_1.mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith({ roles });
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with GroupNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { groupName };
            const error = new UserManagementError_1.GroupNotFoundError(groupName);
            mockGroupAdminService.listRolesForGroup.mockRejectedValue(error);
            yield controller.listRolesForGroup(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
});
