// tests/unit/api/controllers/group.admin.controller.spec.ts

import { NextFunction, Request, Response } from 'express';
import { GroupAdminController } from '../../../../src/api/controllers/group.admin.controller';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { IGroupAdminService } from '../../../../src/application/interfaces/IGroupAdminService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { container } from '../../../../src/container'; // Use actual container if needed, or mock service directly
import { Group } from '../../../../src/domain/entities/Group';
import { AssignmentError, GroupExistsError, GroupNotFoundError, RoleNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';
import { TYPES } from '../../../../src/shared/constants/types';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { mockAdminUser } from '../../../mocks/adminUser.mock'; // Mock admin user
import { mockLogger } from '../../../mocks/logger.mock'; // Mock logger

// --- Mock the Service Layer ---
const mockGroupAdminService: jest.Mocked<IGroupAdminService> = {
    createGroup: jest.fn(),
    getGroup: jest.fn(),
    listGroups: jest.fn(),
    deleteGroup: jest.fn(),
    assignRoleToGroup: jest.fn(), // Added
    removeRoleFromGroup: jest.fn(), // Added
    listRolesForGroup: jest.fn(), // Added
};

describe('GroupAdminController', () => {
    let controller: GroupAdminController;
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let mockStatus: jest.Mock;
    let mockJson: jest.Mock;
    let mockSend: jest.Mock;

    beforeAll(() => {
        // Register the mock service implementation in the container
        // Do this ONLY if the controller resolves the service via the container
        // If service is passed via constructor, just pass the mock directly below
        container.register<IGroupAdminService>(TYPES.GroupAdminService, { useValue: mockGroupAdminService });
        container.register<ILogger>(TYPES.Logger, { useValue: mockLogger }); // Ensure logger is mocked too
    });

    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mocks

        // Resolve controller instance (if using container)
        // controller = container.resolve(GroupAdminController);
        // OR Instantiate controller directly with mocks (if not using container resolution in test)
        controller = new GroupAdminController(mockGroupAdminService, mockLogger);


        // Mock Express objects
        mockRequest = {
            adminUser: { ...mockAdminUser }, // Attach mock admin user
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
        const createdGroup = new Group('test-group', 'Test group', undefined, new Date(), new Date());

        it('should call service createGroup and return 201 with group data', async () => {
            mockRequest.body = groupDetails;
            mockGroupAdminService.createGroup.mockResolvedValue(createdGroup);

            await controller.createGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.createGroup).toHaveBeenCalledWith(mockAdminUser, groupDetails);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(mockJson).toHaveBeenCalledWith(createdGroup);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with error if service throws GroupExistsError', async () => {
            mockRequest.body = groupDetails;
            const error = new GroupExistsError(groupDetails.groupName);
            mockGroupAdminService.createGroup.mockRejectedValue(error);

            await controller.createGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.createGroup).toHaveBeenCalledWith(mockAdminUser, groupDetails);
            expect(mockStatus).not.toHaveBeenCalled();
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should call next with error if adminUser is missing', async () => {
            mockRequest.adminUser = undefined; // Simulate missing admin user
            mockRequest.body = groupDetails;

            // Controller throws directly if adminUser is missing
            await expect(controller.createGroup(mockRequest as Request, mockResponse as Response, mockNext))
                .rejects.toThrow(BaseError); // Controller's internal check throws

            // Check the error properties if needed
            try {
                await controller.createGroup(mockRequest as Request, mockResponse as Response, mockNext)
            } catch (e: any) {
                expect(e.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
                expect(e.message).toContain('Admin context missing');
            }

            expect(mockGroupAdminService.createGroup).not.toHaveBeenCalled();
            expect(mockNext).not.toHaveBeenCalled(); // Error is thrown before next is called
        });
    });

    // --- GET /admin/groups/:groupName ---
    describe('getGroup', () => {
        const groupName = 'get-this-group';
        const foundGroup = new Group(groupName, 'Desc', undefined, new Date(), new Date());

        it('should call service getGroup and return 200 with group data if found', async () => {
            mockRequest.params = { groupName };
            mockGroupAdminService.getGroup.mockResolvedValue(foundGroup);

            await controller.getGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith(foundGroup);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with NotFoundError if service returns null', async () => {
            mockRequest.params = { groupName: 'not-found-group' };
            mockGroupAdminService.getGroup.mockResolvedValue(null);

            await controller.getGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(mockAdminUser, 'not-found-group');
            expect(mockStatus).not.toHaveBeenCalled();
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError));
            expect((mockNext as jest.Mock).mock.calls[0][0].statusCode).toBe(HttpStatusCode.NOT_FOUND);
            expect((mockNext as jest.Mock).mock.calls[0][0].name).toBe('NotFoundError');
        });

        it('should call next with error if service throws', async () => {
            mockRequest.params = { groupName };
            const error = new Error('Service failed');
            mockGroupAdminService.getGroup.mockRejectedValue(error);

            await controller.getGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.getGroup).toHaveBeenCalledWith(mockAdminUser, groupName);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- GET /admin/groups ---
    describe('listGroups', () => {
        const now = new Date(); // Helper date
        const mockGroups = [
            // Provide all 5 arguments for each Group instance
            new Group('g1', 'Group One Description', 10, now, now),
            new Group('g2', undefined, undefined, now, now) // Use undefined for optional args
        ];
        const mockResult = { groups: mockGroups, nextToken: 'tok1' };

        it('should call service listGroups and return 200 with result', async () => {
            mockRequest.query = { limit: '10', nextToken: 'start' };
            mockGroupAdminService.listGroups.mockResolvedValue(mockResult);

            await controller.listGroups(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.listGroups).toHaveBeenCalledWith(mockAdminUser, 10, 'start');
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith(mockResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing query params', async () => {
            mockRequest.query = {};
            mockGroupAdminService.listGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            await controller.listGroups(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockGroupAdminService.listGroups).toHaveBeenCalledWith(mockAdminUser, undefined, undefined);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.OK);
        });

        it('should call next with error if service throws', async () => {
            const error = new Error('Service failed');
            mockGroupAdminService.listGroups.mockRejectedValue(error);
            await controller.listGroups(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- DELETE /admin/groups/:groupName ---
    describe('deleteGroup', () => {
        const groupName = 'delete-this-group';

        it('should call service deleteGroup and return 204 No Content', async () => {
            mockRequest.params = { groupName };
            mockGroupAdminService.deleteGroup.mockResolvedValue(undefined);

            await controller.deleteGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with GroupNotFoundError if service throws it', async () => {
            mockRequest.params = { groupName };
            const error = new GroupNotFoundError(groupName);
            mockGroupAdminService.deleteGroup.mockRejectedValue(error);

            await controller.deleteGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.deleteGroup).toHaveBeenCalledWith(mockAdminUser, groupName);
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockStatus).not.toHaveBeenCalled();
        });

        it('should call next with CleanupFailedError if service throws it', async () => {
            mockRequest.params = { groupName };
            const error = new BaseError('CleanupFailedError', 500, 'Cleanup failed');
            mockGroupAdminService.deleteGroup.mockRejectedValue(error);

            await controller.deleteGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- NEW: POST /admin/groups/:groupName/roles ---
    describe('assignRoleToGroup', () => {
        const groupName = 'assign-role-group';
        const roleName = 'role-to-assign';
        const payload = { roleName };

        it('should call service assignRoleToGroup and return 200 with message', async () => {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            mockGroupAdminService.assignRoleToGroup.mockResolvedValue(undefined);

            await controller.assignRoleToGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.assignRoleToGroup).toHaveBeenCalledWith(mockAdminUser, groupName, roleName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith({ message: expect.stringContaining('assigned to group') });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with GroupNotFoundError if service throws it', async () => {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new GroupNotFoundError(groupName);
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            await controller.assignRoleToGroup(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should call next with RoleNotFoundError if service throws it', async () => {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new RoleNotFoundError(roleName);
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            await controller.assignRoleToGroup(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should call next with AssignmentError if service throws it', async () => {
            mockRequest.params = { groupName };
            mockRequest.body = payload;
            const error = new AssignmentError('Assign failed');
            mockGroupAdminService.assignRoleToGroup.mockRejectedValue(error);
            await controller.assignRoleToGroup(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- NEW: DELETE /admin/groups/:groupName/roles/:roleName ---
    describe('removeRoleFromGroup', () => {
        const groupName = 'remove-role-group';
        const roleName = 'role-to-remove';

        it('should call service removeRoleFromGroup and return 204 No Content', async () => {
            mockRequest.params = { groupName, roleName };
            mockGroupAdminService.removeRoleFromGroup.mockResolvedValue(undefined);

            await controller.removeRoleFromGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.removeRoleFromGroup).toHaveBeenCalledWith(mockAdminUser, groupName, roleName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with AssignmentError if service throws it', async () => {
            mockRequest.params = { groupName, roleName };
            const error = new AssignmentError('Remove failed');
            mockGroupAdminService.removeRoleFromGroup.mockRejectedValue(error);
            await controller.removeRoleFromGroup(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- NEW: GET /admin/groups/:groupName/roles ---
    describe('listRolesForGroup', () => {
        const groupName = 'list-roles-group';
        const roles = ['roleA', 'roleB'];

        it('should call service listRolesForGroup and return 200 with roles', async () => {
            mockRequest.params = { groupName };
            mockGroupAdminService.listRolesForGroup.mockResolvedValue(roles);

            await controller.listRolesForGroup(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockGroupAdminService.listRolesForGroup).toHaveBeenCalledWith(mockAdminUser, groupName);
            expect(mockStatus).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockJson).toHaveBeenCalledWith({ roles });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with GroupNotFoundError if service throws it', async () => {
            mockRequest.params = { groupName };
            const error = new GroupNotFoundError(groupName);
            mockGroupAdminService.listRolesForGroup.mockRejectedValue(error);
            await controller.listRolesForGroup(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

});