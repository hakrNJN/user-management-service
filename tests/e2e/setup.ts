import 'reflect-metadata';
import { container } from '../../src/container';
import { TYPES } from '../../src/shared/constants/types';
import { IAssignmentRepository } from '../../src/application/interfaces/IAssignmentRepository';
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { ILogger } from '../../src/application/interfaces/ILogger';
import { IPermissionRepository } from '../../src/application/interfaces/IPermissionRepository';
import { IPolicyEngineAdapter } from '../../src/application/interfaces/IPolicyEngineAdapter';
import { IPolicyRepository } from '../../src/application/interfaces/IPolicyRepository';
import { IRoleRepository } from '../../src/application/interfaces/IRoleRepository';
import { IUserMgmtAdapter } from '../../src/application/interfaces/IUserMgmtAdapter';
import { IUserProfileRepository } from '../../src/application/interfaces/IUserProfileRepository';
import { mock, MockProxy } from 'jest-mock-extended';

// Mock the ADAPTERS and REPOSITORIES
export const assignmentRepositoryMock: MockProxy<IAssignmentRepository> = mock<IAssignmentRepository>();
export const configServiceMock: MockProxy<IConfigService> = mock<IConfigService>();
export const loggerMock: MockProxy<ILogger> = mock<ILogger>();
export const permissionRepositoryMock: MockProxy<IPermissionRepository> = mock<IPermissionRepository>();
export const policyEngineAdapterMock: MockProxy<IPolicyEngineAdapter> = mock<IPolicyEngineAdapter>();
export const policyRepositoryMock: MockProxy<IPolicyRepository> = mock<IPolicyRepository>();
export const roleRepositoryMock: MockProxy<IRoleRepository> = mock<IRoleRepository>();
export const userMgmtAdapterMock: MockProxy<IUserMgmtAdapter> = mock<IUserMgmtAdapter>();
export const userProfileRepositoryMock: MockProxy<IUserProfileRepository> = mock<IUserProfileRepository>();

// Reset mocks before each test
beforeEach(() => {
    jest.resetAllMocks();
});

// Register the mocks in the container
container.register(TYPES.AssignmentRepository, { useValue: assignmentRepositoryMock });
container.register(TYPES.ConfigService, { useValue: configServiceMock });
container.register(TYPES.Logger, { useValue: loggerMock });
container.register(TYPES.PermissionRepository, { useValue: permissionRepositoryMock });
container.register(TYPES.PolicyEngineAdapter, { useValue: policyEngineAdapterMock });
container.register(TYPES.PolicyRepository, { useValue: policyRepositoryMock });
container.register(TYPES.RoleRepository, { useValue: roleRepositoryMock });
container.register(TYPES.UserMgmtAdapter, { useValue: userMgmtAdapterMock });
container.register(TYPES.UserProfileRepository, { useValue: userProfileRepositoryMock });