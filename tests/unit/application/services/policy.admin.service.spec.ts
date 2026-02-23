import 'reflect-metadata';
import { container } from 'tsyringe';
import { PolicyAdminService } from '../../../../src/application/services/policy.admin.service';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { Policy } from '../../../../src/domain/entities/Policy';
import { CreatePolicyAdminDto, UpdatePolicyAdminDto } from '../../../../src/api/dtos/policy.admin.dto';
import { PolicyNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { v4 as uuidv4 } from 'uuid';
import { policyRepositoryMock } from '../../../mocks/policyRepository.mock';
import { policyEngineAdapterMock } from '../../../mocks/policyEngineAdapter.mock';
import { loggerMock } from '../../../mocks/logger.mock';

jest.mock('uuid');

describe('PolicyAdminService', () => {
    let service: PolicyAdminService;

    const adminUser: AdminUser = {
        id: 'admin-id', tenantId: 'test-tenant',
        username: 'admin-user',
        roles: ['admin'],
    };

    const policyId = 'policy-id-123';
    const policyEntity = new Policy('test-tenant', policyId, 'Test Policy', 'def', 'rego', 1, 'A test policy', {}, new Date(), new Date(), true);

    beforeEach(() => {
        service = container.resolve(PolicyAdminService);
        (uuidv4 as jest.Mock).mockReturnValue(policyId);
    });

    describe('createPolicy', () => {
        it('should create a policy successfully', async () => {
            const details: CreatePolicyAdminDto = { policyName: 'New Policy', policyDefinition: 'def', policyLanguage: 'rego' };
            policyRepositoryMock.save.mockResolvedValue();

            const result = await service.createPolicy(adminUser, details);

            expect(policyRepositoryMock.save).toHaveBeenCalledWith(expect.any(Policy));
            expect(result).toBeInstanceOf(Policy);
            expect(result.policyName).toBe('New Policy');
            expect(result.version).toBe(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('CREATE_POLICY'), expect.any(Object));
        });
    });

    describe('getPolicy', () => {
        it('should return a policy if found', async () => {
            policyRepositoryMock.findById.mockResolvedValue(policyEntity);

            const result = await service.getPolicy(adminUser, policyId);

            expect(policyRepositoryMock.findById).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(result).toEqual(policyEntity);
        });

        it('should return null if policy not found', async () => {
            policyRepositoryMock.findById.mockResolvedValue(null);

            const result = await service.getPolicy(adminUser, policyId);

            expect(result).toBeNull();
        });
    });

    describe('updatePolicy', () => {
        it('should update a policy successfully, incrementing the version', async () => {
            const updateDetails: UpdatePolicyAdminDto = { policyName: 'Updated Policy' };
            policyRepositoryMock.findById.mockResolvedValue(policyEntity);
            policyRepositoryMock.save.mockResolvedValue();

            const result = await service.updatePolicy(adminUser, policyId, updateDetails);

            expect(policyRepositoryMock.findById).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(policyRepositoryMock.save).toHaveBeenCalledWith(expect.objectContaining({
                version: policyEntity.version + 1,
                policyName: 'Updated Policy'
            }));
            expect(result.version).toBe(policyEntity.version + 1);
        });

        it('should throw PolicyNotFoundError if policy does not exist', async () => {
            const updateDetails: UpdatePolicyAdminDto = { policyName: 'Updated Policy' };
            policyRepositoryMock.findById.mockResolvedValue(null);

            await expect(service.updatePolicy(adminUser, policyId, updateDetails)).rejects.toThrow(PolicyNotFoundError);
        });
    });

    describe('deletePolicy', () => {
        it('should delete a policy successfully', async () => {
            policyRepositoryMock.delete.mockResolvedValue(true);

            await service.deletePolicy(adminUser, policyId);

            expect(policyRepositoryMock.delete).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('DELETE_POLICY'), expect.any(Object));
        });
    });

    describe('listPolicies', () => {
        it('should list policies', async () => {
            const policies = { items: [policyEntity], total: 1 };
            policyRepositoryMock.list.mockResolvedValue(policies as any);

            const result = await service.listPolicies(adminUser, {});

            expect(policyRepositoryMock.list).toHaveBeenCalledWith(expect.any(String), {});
            expect(result).toEqual(policies);
        });
    });

    describe('getPolicyVersion', () => {
        it('should retrieve a specific version of a policy', async () => {
            policyRepositoryMock.getPolicyVersion.mockResolvedValue(policyEntity);

            const result = await service.getPolicyVersion(adminUser, policyId, 1);

            expect(policyRepositoryMock.getPolicyVersion).toHaveBeenCalledWith(expect.any(String), policyId, 1);
            expect(result).toEqual(policyEntity);
        });

        it('should return null if policy version not found', async () => {
            policyRepositoryMock.getPolicyVersion.mockResolvedValue(null);

            const result = await service.getPolicyVersion(adminUser, policyId, 1);

            expect(result).toBeNull();
        });
    });

    describe('listPolicyVersions', () => {
        it('should list all policy versions', async () => {
            const versions = [policyEntity, new Policy('test-tenant', policyId, 'name', 'def', 'rego', 2, '', {}, new Date(), new Date(), true)];
            policyRepositoryMock.listPolicyVersions.mockResolvedValue(versions);

            const result = await service.listPolicyVersions(adminUser, policyId);

            expect(policyRepositoryMock.listPolicyVersions).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(result).toEqual(versions);
        });
    });

    describe('rollbackPolicy', () => {
        it('should rollback a policy to a specific version', async () => {
            const oldVersionEntity = new Policy('test-tenant', policyId, 'Test Policy', 'old def', 'rego', 1, 'A test policy', {}, new Date(), new Date(), true);
            policyRepositoryMock.getPolicyVersion.mockResolvedValue(oldVersionEntity);
            policyRepositoryMock.save.mockResolvedValue();
            (uuidv4 as jest.Mock).mockReturnValue('new-policy-id');

            const result = await service.rollbackPolicy(adminUser, policyId, 1);

            expect(policyRepositoryMock.getPolicyVersion).toHaveBeenCalledWith(expect.any(String), policyId, 1);
            expect(policyRepositoryMock.save).toHaveBeenCalledWith(expect.objectContaining({
                id: 'new-policy-id',
                version: 1
            }));
            expect(result.id).toBe('new-policy-id');
        });

        it('should throw PolicyNotFoundError if the version to rollback to does not exist', async () => {
            policyRepositoryMock.getPolicyVersion.mockResolvedValue(null);

            await expect(service.rollbackPolicy(adminUser, policyId, 1)).rejects.toThrow(PolicyNotFoundError);
        });
    });

    describe('Permissions', () => {
        it('should throw ForbiddenError if admin user does not have required role', async () => {
            const nonAdminUser: AdminUser = {
                id: 'non-admin', tenantId: 'test-tenant',
                username: 'non-admin-user', roles: ['viewer']
            };
            const details: CreatePolicyAdminDto = { policyName: 'New Policy', policyDefinition: 'def', policyLanguage: 'rego' };

            await expect(service.createPolicy(nonAdminUser, details)).rejects.toThrow(BaseError);
            await expect(service.createPolicy(nonAdminUser, details)).rejects.toHaveProperty('statusCode', 403);
        });
    });
});