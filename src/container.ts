import { container } from 'tsyringe';
import { TYPES } from './shared/constants/types';

// --- Import Interfaces (Ports) ---
import { IAssignmentRepository } from './application/interfaces/IAssignmentRepository';
import { IConfigService } from './application/interfaces/IConfigService';
import { IGroupAdminService } from './application/interfaces/IGroupAdminService';
import { ILogger } from './application/interfaces/ILogger';
import { IPermissionAdminService } from './application/interfaces/IPermissionAdminService';
import { IPermissionRepository } from './application/interfaces/IPermissionRepository';
import { IPolicyAdminService } from './application/interfaces/IPolicyAdminService';
import { IPolicyEngineAdapter } from './application/interfaces/IPolicyEngineAdapter';
import { IPolicyRepository } from './application/interfaces/IPolicyRepository';
import { IPolicyService } from './application/interfaces/IPolicyService';
import { IRoleAdminService } from './application/interfaces/IRoleAdminService';
import { IRoleRepository } from './application/interfaces/IRoleRepository';
import { IUserAdminService } from './application/interfaces/IUserAdminService';
import { IUserMgmtAdapter } from './application/interfaces/IUserMgmtAdapter';
import { IUserProfileRepository } from './application/interfaces/IUserProfileRepository';
import { JwtValidator } from './shared/utils/jwtValidator'; // Keep original import for production/non-test environments

// --- Import Implementations (Adapters/Services/Infrastructure) ---
// Infrastructure - Adapters
import { CognitoUserMgmtAdapter } from './infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { DynamoDbPolicyEngineAdapter } from './infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter';

// Infrastructure - Config & Logging
import { EnvironmentConfigService } from './infrastructure/config/EnvironmentConfigService';
import { WinstonLogger } from './infrastructure/logging/WinstonLogger';

// Infrastructure - Persistence
import { DynamoAssignmentRepository } from './infrastructure/persistence/dynamodb/DynamoAssignmentRepository';
import { DynamoPolicyRepository } from './infrastructure/persistence/dynamodb/DynamoPolicyRepository';
import { DynamoDBProvider } from './infrastructure/persistence/dynamodb/dynamodb.client'; // Keep original import
import { DynamoPermissionRepository } from './infrastructure/persistence/dynamodb/DynamoPermissionRepository';
import { DynamoRoleRepository } from './infrastructure/persistence/dynamodb/DynamoRoleRepository';
import { DynamoUserProfileRepository } from './infrastructure/persistence/dynamodb/DynamoUserProfileRepository';

// Application Services
import { GroupAdminService } from './application/services/group.admin.service';
import { PermissionAdminService } from './application/services/permission.admin.service';
import { PolicyAdminService } from './application/services/policy.admin.service';
import { PolicyService } from './application/services/PolicyService';
import { RoleAdminService } from './application/services/role.admin.service';
import { UserAdminService } from './application/services/user.admin.service';

// Import the mock JwtValidator and MockJwtValidatorClass for testing purposes
import { mockJwtValidator, MockJwtValidatorClass } from '../tests/mocks/jwtValidator.mock';

// Import the mock DynamoDBProvider and MockDynamoDBProviderClass for testing purposes
import { MockDynamoDBProviderClass } from '../tests/mocks/dynamoDBProvider.mock'; // Added import


// --- Register Infrastructure Services (Singletons recommended) ---
container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
container.registerSingleton<IConfigService>(TYPES.ConfigService, EnvironmentConfigService);

// Conditionally register DynamoDBProvider based on environment
if (process.env.NODE_ENV === 'test') {
    container.registerSingleton<DynamoDBProvider>(TYPES.DynamoDBProvider, MockDynamoDBProviderClass); // Use mock
} else {
    container.registerSingleton<DynamoDBProvider>(TYPES.DynamoDBProvider, DynamoDBProvider); // Use real
}

// Conditionally register JwtValidator based on environment
if (process.env.NODE_ENV === 'test') {
    // During tests, register the MockJwtValidatorClass
    container.registerSingleton<JwtValidator>(TYPES.JwtValidator, MockJwtValidatorClass);
} else {
    // In production or other environments, register the actual JwtValidator
    container.registerSingleton<JwtValidator>(TYPES.JwtValidator, JwtValidator);
}


// --- Register Adapters (Singletons usually appropriate) ---
container.registerSingleton<IUserMgmtAdapter>(TYPES.UserMgmtAdapter, CognitoUserMgmtAdapter);
container.registerSingleton<IPolicyEngineAdapter>(TYPES.PolicyEngineAdapter, DynamoDbPolicyEngineAdapter);


// --- Register Persistence Repositories (Often Singleton, but can be Transient if stateful/scoped) ---
container.registerSingleton<IAssignmentRepository>(TYPES.AssignmentRepository, DynamoAssignmentRepository);
container.registerSingleton<IPermissionRepository>(TYPES.PermissionRepository, DynamoPermissionRepository);
container.registerSingleton<IRoleRepository>(TYPES.RoleRepository, DynamoRoleRepository);
container.registerSingleton<IPolicyRepository>(TYPES.PolicyRepository, DynamoPolicyRepository);
container.registerSingleton<IUserProfileRepository>(TYPES.UserProfileRepository, DynamoUserProfileRepository);


// --- Register Application Services (Singletons often suitable) ---
container.registerSingleton<IUserAdminService>(TYPES.UserAdminService, UserAdminService);
container.registerSingleton<IGroupAdminService>(TYPES.GroupAdminService, GroupAdminService);
container.registerSingleton<IPermissionAdminService>(TYPES.PermissionAdminService, PermissionAdminService);
container.registerSingleton<IRoleAdminService>(TYPES.RoleAdminService, RoleAdminService);
container.registerSingleton<IPolicyAdminService>(TYPES.PolicyAdminService, PolicyAdminService);
container.registerSingleton<IPolicyService>(TYPES.PolicyService, PolicyService);


// --- Register Controllers (Usually Transient - handled automatically by tsyringe if decorated) ---
// Ensure controllers are decorated with @injectable()
// No explicit registration needed here unless overriding behavior or needing specific scope.
// Examples (make sure these files exist and controllers are @injectable):
// import './api/controllers/group.admin.controller';
// import './api/controllers/permission.admin.controller';
// import './api/controllers/policy.admin.controller';
// import './api/controllers/role.admin.controller';
// import './api/controllers/system.controller';
// import './api/controllers/user.admin.controller';


// Export the configured container
export { container };