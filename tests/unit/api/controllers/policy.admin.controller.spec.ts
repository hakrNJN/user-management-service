import { NextFunction, Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata'; // Must be first for tsyringe
import { container } from 'tsyringe'; // Use container to resolve controller

import { PolicyAdminController } from '../../../../src/api/controllers/policy.admin.controller'; // Adjust path
import { CreatePolicyAdminDto, PolicyIdParamsDto, UpdatePolicyAdminDto, UpdatePolicyAdminParams } from '../../../../src/api/dtos/policy.admin.dto'; // Adjust path
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPolicyAdminService } from '../../../../src/application/interfaces/IPolicyAdminService'; // Adjust path
import { Policy } from '../../../../src/domain/entities/Policy'; // Adjust path
import { InvalidPolicySyntaxError, PolicyExistsError, PolicyNotFoundError } from '../../../../src/domain/exceptions/UserManagementError'; // Adjust path
import { TYPES } from '../../../../src/shared/constants/types';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface'; // Adjust path
import { mockAdminUser } from '../../../mocks/adminUser.mock'; // Adjust path

describe('PolicyAdminController', () => {
    let controller: PolicyAdminController;
    let mockPolicyAdminService: MockProxy<IPolicyAdminService>;
    let mockLoggerInstance: MockProxy<ILogger>; // Renamed to avoid conflict
    let mockRequest: MockProxy<Request>;
    let mockResponse: MockProxy<Response>;
    let mockNext: NextFunction;

    const testAdminUser: AdminUser = { ...mockAdminUser }; // Use a copy

    beforeEach(() => {
        // Create fresh mocks for each test
        mockPolicyAdminService = mock<IPolicyAdminService>();
        mockLoggerInstance = mock<ILogger>(); // Use the renamed mock instance
        mockRequest = mock<Request>();
        mockResponse = mock<Response>();
        mockNext = jest.fn();

        // Setup mock response methods
        mockResponse.status.mockReturnThis(); // Enable chaining
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis();

        // Setup default mock request properties
        mockRequest.adminUser = testAdminUser;
        mockRequest.params = {};
        mockRequest.query = {};
        mockRequest.body = {};

        // Clear container instances and register mocks for this test suite
        container.clearInstances();
        container.registerInstance(TYPES.PolicyAdminService, mockPolicyAdminService);
        container.registerInstance(TYPES.Logger, mockLoggerInstance); // Register the mock logger

        // Resolve the controller instance from the container
        controller = container.resolve(PolicyAdminController);
    });

    // --- Test getAdminUser (implicitly tested in each method) ---
    it('getAdminUser check: should call next with InternalServerError if adminUser is missing', async () => {
        mockRequest.adminUser = undefined; // Simulate missing admin user
        // Expect the controller's internal check to throw
        await controller.createPolicy(mockRequest, mockResponse, mockNext); // Use any method to trigger check
        expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError));
        const errorArg = (mockNext as jest.Mock).mock.calls[0][0] as BaseError;
        expect(errorArg.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
        expect(errorArg.message).toContain('Admin context missing');
        expect(mockPolicyAdminService.createPolicy).not.toHaveBeenCalled();
    });

    // --- Test createPolicy ---
    describe('createPolicy', () => {
        const createDto: CreatePolicyAdminDto = {
            policyName: 'policy.test.create',
            policyDefinition: 'package test\nallow { input.user.role == "admin" }',
            policyLanguage: 'rego',
            description: 'Test policy create',
        };
        const createdPolicy = new Policy('policy-uuid-1', createDto.policyName, createDto.policyDefinition, createDto.policyLanguage, 1, createDto.description);

        it('should call service.createPolicy and return 201 with the created policy', async () => {
            mockRequest.body = createDto;
            mockPolicyAdminService.createPolicy.mockResolvedValue(createdPolicy);

            await controller.createPolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.createPolicy).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(mockResponse.json).toHaveBeenCalledWith(createdPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with PolicyExistsError if service throws it', async () => {
            mockRequest.body = createDto;
            const error = new PolicyExistsError(createDto.policyName);
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);

            await controller.createPolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.createPolicy).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should call next with InvalidPolicySyntaxError if service throws it', async () => {
            mockRequest.body = createDto;
            const error = new InvalidPolicySyntaxError(createDto.policyName, createDto.policyLanguage, { line: 1, detail: 'parse error' });
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);

            await controller.createPolicy(mockRequest, mockResponse, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should call next with generic error if service throws unexpectedly', async () => {
            mockRequest.body = createDto;
            const error = new Error('Database connection failed');
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);

            await controller.createPolicy(mockRequest, mockResponse, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- Test getPolicy ---
    describe('getPolicy', () => {
        const policyId = 'policy-uuid-get';
        const foundPolicy = new Policy(policyId, 'policy.test.get', 'def', 'rego', 1);

        it('should call service.getPolicy and return 200 with the policy if found', async () => {
            mockRequest.params = { policyId } as PolicyIdParamsDto;
            mockPolicyAdminService.getPolicy.mockResolvedValue(foundPolicy);

            await controller.getPolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(foundPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with PolicyNotFoundError if service returns null', async () => {
            mockRequest.params = { policyId: 'not-found-id' } as PolicyIdParamsDto;
            mockPolicyAdminService.getPolicy.mockResolvedValue(null);

            // Controller now throws PolicyNotFoundError when service returns null
            await controller.getPolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, 'not-found-id');
            expect(mockNext).toHaveBeenCalledWith(expect.any(PolicyNotFoundError)); // Check error type
            const errorArg = (mockNext as jest.Mock).mock.calls[0][0] as PolicyNotFoundError;
            expect(errorArg.statusCode).toBe(404);
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should call next with generic error if service throws unexpectedly', async () => {
            mockRequest.params = { policyId } as PolicyIdParamsDto;
            const error = new Error('Lookup failed');
            mockPolicyAdminService.getPolicy.mockRejectedValue(error);

            await controller.getPolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- Test listPolicies ---
    describe('listPolicies', () => {
        const policies = [new Policy('p1-id', 'p1', 'def', 'rego', 1), new Policy('p2-id', 'p2', 'def', 'rego', 1)];
        const queryResult = { items: policies, lastEvaluatedKey: { PK: { S: 'p2-id' } } }; // Example key

        it('should call service.listPolicies and return 200 with results', async () => {
            mockRequest.query = { limit: '5', language: 'rego' } as any; // Simulate query params
            const expectedOptions = { limit: 5, language: 'rego', startKey: undefined };
            mockPolicyAdminService.listPolicies.mockResolvedValue(queryResult);

            await controller.listPolicies(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(testAdminUser, expectedOptions);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(queryResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing query parameters', async () => {
            mockRequest.query = {};
            const emptyResult = { items: [], lastEvaluatedKey: undefined };
            const expectedOptions = { limit: undefined, language: undefined, startKey: undefined };
            mockPolicyAdminService.listPolicies.mockResolvedValue(emptyResult);

            await controller.listPolicies(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(testAdminUser, expectedOptions);
            expect(mockResponse.json).toHaveBeenCalledWith(emptyResult);
        });

        it('should call next with generic error if service throws unexpectedly', async () => {
            mockRequest.query = {};
            const error = new Error('List failed');
            mockPolicyAdminService.listPolicies.mockRejectedValue(error);

            await controller.listPolicies(mockRequest, mockResponse, mockNext);

            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to list policies'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- Test updatePolicy ---
    describe('updatePolicy', () => {
        const policyId = 'policy-uuid-update';
        const updateDto: UpdatePolicyAdminDto = {
            description: 'Updated policy description',
            policyDefinition: 'package updated\nallow { input.user.email == "test@example.com" }',
        };
        const updatedPolicy = new Policy(policyId, 'policy.test.update', updateDto.policyDefinition!, 'rego', 1, updateDto.description); // Assume name/lang not changed

        it('should call service.updatePolicy and return 200 with the updated policy', async () => {
            mockRequest.params = { policyId } as UpdatePolicyAdminParams;
            mockRequest.body = updateDto;
            mockPolicyAdminService.updatePolicy.mockResolvedValue(updatedPolicy);

            await controller.updatePolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledWith(testAdminUser, policyId, updateDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(updatedPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with PolicyNotFoundError if service throws it', async () => {
            mockRequest.params = { policyId } as UpdatePolicyAdminParams;
            mockRequest.body = updateDto;
            const error = new PolicyNotFoundError(policyId);
            mockPolicyAdminService.updatePolicy.mockRejectedValue(error);

            await controller.updatePolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledWith(testAdminUser, policyId, updateDto);
            expect(mockLoggerInstance.error).not.toHaveBeenCalled(); // Let error middleware handle logging 404s
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

         it('should call next with InvalidPolicySyntaxError if service throws it', async () => {
            mockRequest.params = { policyId } as UpdatePolicyAdminParams;
            mockRequest.body = updateDto; // Assume definition causes syntax error
            const error = new InvalidPolicySyntaxError(policyId, 'rego');
            mockPolicyAdminService.updatePolicy.mockRejectedValue(error);

            await controller.updatePolicy(mockRequest, mockResponse, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should call next with generic error if service throws unexpectedly', async () => {
             mockRequest.params = { policyId } as UpdatePolicyAdminParams;
             mockRequest.body = updateDto;
             const error = new Error('Update DB failed');
             mockPolicyAdminService.updatePolicy.mockRejectedValue(error);

             await controller.updatePolicy(mockRequest, mockResponse, mockNext);

             expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to update policy'), expect.any(Object));
             expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    // --- Test deletePolicy ---
    describe('deletePolicy', () => {
        const policyId = 'policy-uuid-delete';

        it('should call service.deletePolicy and return 204 No Content', async () => {
            mockRequest.params = { policyId } as PolicyIdParamsDto;
            mockPolicyAdminService.deletePolicy.mockResolvedValue(undefined); // Service returns void on success

            await controller.deletePolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with PolicyNotFoundError if service throws it', async () => {
            mockRequest.params = { policyId } as PolicyIdParamsDto;
            const error = new PolicyNotFoundError(policyId);
            mockPolicyAdminService.deletePolicy.mockRejectedValue(error);

            await controller.deletePolicy(mockRequest, mockResponse, mockNext);

            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockLoggerInstance.error).not.toHaveBeenCalled(); // Let error middleware handle logging 404s
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should call next with generic error if service throws unexpectedly', async () => {
             mockRequest.params = { policyId } as PolicyIdParamsDto;
             const error = new Error('Delete DB failed');
             mockPolicyAdminService.deletePolicy.mockRejectedValue(error);

             await controller.deletePolicy(mockRequest, mockResponse, mockNext);

             expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete policy'), expect.any(Object));
             expect(mockNext).toHaveBeenCalledWith(error);
        });
    });
});