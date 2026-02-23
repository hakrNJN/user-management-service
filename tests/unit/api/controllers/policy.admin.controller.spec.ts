import 'reflect-metadata';
import { container } from 'tsyringe';
import { PolicyAdminController } from '../../../../src/api/controllers/policy.admin.controller';
import { IPolicyAdminService } from '../../../../src/application/interfaces/IPolicyAdminService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { TYPES } from '../../../../src/shared/constants/types';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { Policy } from '../../../../src/domain/entities/Policy';
import { PolicyNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';

describe('PolicyAdminController', () => {
    let controller: PolicyAdminController;
    let policyAdminServiceMock: MockProxy<IPolicyAdminService>;
    let loggerMock: MockProxy<ILogger>;
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: MockProxy<NextFunction>;

    const adminUser: AdminUser = { id: 'admin-id', tenantId: 'test-tenant', username: 'admin', roles: ['admin'] };

    beforeEach(() => {
        policyAdminServiceMock = mock<IPolicyAdminService>();
        loggerMock = mock<ILogger>();

        container.register<IPolicyAdminService>(TYPES.PolicyAdminService, { useValue: policyAdminServiceMock });
        container.register<ILogger>(TYPES.Logger, { useValue: loggerMock });

        controller = container.resolve(PolicyAdminController);

        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();

        req.adminUser = adminUser;
        res.status.mockReturnThis();
        res.json.mockReturnThis();
        res.send.mockReturnThis();
    });

    afterEach(() => {
        container.clearInstances();
        jest.clearAllMocks();
    });

    describe('createPolicy', () => {
        it('should create a policy and return 201 status', async () => {
            const policyDetails = { policyName: 'new-policy', policyDefinition: 'def', policyLanguage: 'rego' };
            req.body = policyDetails;
            const createdPolicy = new Policy('test-tenant', 'id', policyDetails.policyName, policyDetails.policyDefinition, policyDetails.policyLanguage, 1, '', {}, new Date(), new Date(), true);
            policyAdminServiceMock.createPolicy.mockResolvedValue(createdPolicy);

            await controller.createPolicy(req, res, next);

            expect(policyAdminServiceMock.createPolicy).toHaveBeenCalledWith(adminUser, policyDetails);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(res.json).toHaveBeenCalledWith(createdPolicy);
        });

        it('should call next with error if service throws', async () => {
            const error = new Error('test error');
            req.body = { policyName: 'new-policy', policyDefinition: 'def', policyLanguage: 'rego' };
            policyAdminServiceMock.createPolicy.mockRejectedValue(error);

            await controller.createPolicy(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('getPolicy', () => {
        it('should get a policy and return 200 status', async () => {
            const policyId = 'policy-id';
            req.params = { policyId };
            const policy = new Policy('test-tenant', policyId, 'name', 'def', 'rego', 1, '', {}, new Date(), new Date(), true);
            policyAdminServiceMock.getPolicy.mockResolvedValue(policy);

            await controller.getPolicy(req, res, next);

            expect(policyAdminServiceMock.getPolicy).toHaveBeenCalledWith(adminUser, policyId);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(policy);
        });

        it('should call next with error if policy not found', async () => {
            const policyId = 'not-found';
            req.params = { policyId };
            policyAdminServiceMock.getPolicy.mockResolvedValue(null);

            await controller.getPolicy(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(PolicyNotFoundError));
        });
    });

    describe('updatePolicy', () => {
        it('should update a policy and return 200 status', async () => {
            const policyId = 'policy-id';
            const updates = { description: 'updated' };
            req.params = { policyId };
            req.body = updates;
            const updatedPolicy = new Policy('test-tenant', policyId, 'name', 'def', 'rego', 2, 'updated', {}, new Date(), new Date(), true);
            policyAdminServiceMock.updatePolicy.mockResolvedValue(updatedPolicy);

            await controller.updatePolicy(req, res, next);

            expect(policyAdminServiceMock.updatePolicy).toHaveBeenCalledWith(adminUser, policyId, updates);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(updatedPolicy);
        });
    });

    describe('deletePolicy', () => {
        it('should delete a policy and return 204 status', async () => {
            const policyId = 'policy-id';
            req.params = { policyId };
            policyAdminServiceMock.deletePolicy.mockResolvedValue();

            await controller.deletePolicy(req, res, next);

            expect(policyAdminServiceMock.deletePolicy).toHaveBeenCalledWith(adminUser, policyId);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(res.send).toHaveBeenCalled();
        });
    });

    describe('listPolicies', () => {
        it('should list policies and return 200 status', async () => {
            req.query = { limit: '10' };
            const policies = { items: [], total: 0 };
            policyAdminServiceMock.listPolicies.mockResolvedValue(policies);

            await controller.listPolicies(req, res, next);

            expect(policyAdminServiceMock.listPolicies).toHaveBeenCalledWith(adminUser, { limit: '10', startKey: undefined, language: undefined });
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(policies);
        });
    });

    describe('getPolicyVersion', () => {
        it('should get a specific policy version and return 200 status', async () => {
            const policyId = 'policy-id';
            const version = '1';
            req.params = { policyId, version };
            const policy = new Policy('test-tenant', policyId, 'name', 'def', 'rego', 1, '', {}, new Date(), new Date(), true);
            policyAdminServiceMock.getPolicyVersion.mockResolvedValue(policy);

            await controller.getPolicyVersion(req, res, next);

            expect(policyAdminServiceMock.getPolicyVersion).toHaveBeenCalledWith(adminUser, policyId, 1);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(policy);
        });

        it('should call next with error if policy version not found', async () => {
            const policyId = 'policy-id';
            const version = '99';
            req.params = { policyId, version };
            policyAdminServiceMock.getPolicyVersion.mockResolvedValue(null);

            await controller.getPolicyVersion(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(PolicyNotFoundError));
        });
    });

    describe('listPolicyVersions', () => {
        it('should list all policy versions and return 200 status', async () => {
            const policyId = 'policy-id';
            req.params = { policyId };
            const versions = [new Policy('test-tenant', policyId, 'name', 'def', 'rego', 1, '', {}, new Date(), new Date(), true)];
            policyAdminServiceMock.listPolicyVersions.mockResolvedValue(versions);

            await controller.listPolicyVersions(req, res, next);

            expect(policyAdminServiceMock.listPolicyVersions).toHaveBeenCalledWith(adminUser, policyId);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(versions);
        });
    });

    describe('rollbackPolicy', () => {
        it('should rollback a policy and return 200 status', async () => {
            const policyId = 'policy-id';
            const version = '1';
            req.params = { policyId, version };
            const rolledBackPolicy = new Policy('test-tenant', policyId, 'name', 'def', 'rego', 2, '', {}, new Date(), new Date(), true);
            policyAdminServiceMock.rollbackPolicy.mockResolvedValue(rolledBackPolicy);

            await controller.rollbackPolicy(req, res, next);

            expect(policyAdminServiceMock.rollbackPolicy).toHaveBeenCalledWith(adminUser, policyId, 1);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(rolledBackPolicy);
        });
    });
});