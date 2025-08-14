// tests/mocks/repository.mock.ts (Example)
import { IAssignmentRepository } from "../../src/application/interfaces/IAssignmentRepository";
import { IPermissionRepository } from "../../src/application/interfaces/IPermissionRepository";
import { IPolicyEngineAdapter } from "../../src/application/interfaces/IPolicyEngineAdapter";
import { IPolicyRepository } from "../../src/application/interfaces/IPolicyRepository";
import { IRoleRepository } from "../../src/application/interfaces/IRoleRepository";
import { IUserProfileRepository } from "../../src/application/interfaces/IUserProfileRepository";

export const mockRoleRepository: jest.Mocked<IRoleRepository> = {
    create: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

export const mockPermissionRepository: jest.Mocked<IPermissionRepository> = {
    create: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

export const mockAssignmentRepository: jest.Mocked<IAssignmentRepository> = {
    findRolesByGroupName: jest.fn(),
    assignRoleToGroup: jest.fn(),
    removeRoleFromGroup: jest.fn(),
    findGroupsByRoleName: jest.fn(),
    findPermissionsByRoleName: jest.fn(),
    assignPermissionToRole: jest.fn(),
    removePermissionFromRole: jest.fn(),
    findRolesByPermissionName: jest.fn(),
    findCustomRolesByUserId: jest.fn(),
    assignCustomRoleToUser: jest.fn(),
    removeCustomRoleFromUser: jest.fn(),
    findCustomPermissionsByUserId: jest.fn(),
    assignCustomPermissionToUser: jest.fn(),
    removeCustomPermissionFromUser: jest.fn(),
    removeAllAssignmentsForUser: jest.fn(),
    removeAllAssignmentsForGroup: jest.fn(),
    removeAllAssignmentsForRole: jest.fn(),
    removeAllAssignmentsForPermission: jest.fn(),
};

export const mockPolicyRepository: jest.Mocked<IPolicyRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    getPolicyVersion: jest.fn(),
    listPolicyVersions: jest.fn(),
    getAllPolicies: jest.fn(),
};

export const mockPolicyEngineAdapter: jest.Mocked<IPolicyEngineAdapter> = {
    publishPolicy: jest.fn(),
    getPolicyDefinition: jest.fn(),
    deletePolicyDefinition: jest.fn(),
    validatePolicySyntax: jest.fn(),
};

export const mockUserProfileRepository: jest.Mocked<IUserProfileRepository> = {
    findById: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByEmail: jest.fn(),
    findByPhoneNumber: jest.fn(),
    findByMfaStatus: jest.fn(),
};