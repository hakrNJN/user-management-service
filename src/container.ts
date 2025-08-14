import { container } from 'tsyringe';
import { TYPES } from './shared/constants/types';

// --- Import Interfaces (Ports) ---
import { IAssignmentRepository } from './application/interfaces/IAssignmentRepository'; // Added
import { IConfigService } from './application/interfaces/IConfigService';
import { IGroupAdminService } from './application/interfaces/IGroupAdminService';
import { ILogger } from './application/interfaces/ILogger';
import { IPermissionAdminService } from './application/interfaces/IPermissionAdminService'; // Added
import { IPermissionRepository } from './application/interfaces/IPermissionRepository'; // Added
import { IPolicyAdminService } from './application/interfaces/IPolicyAdminService'; // <<< NEW
import { IPolicyEngineAdapter } from './application/interfaces/IPolicyEngineAdapter'; // <<< NEW
import { IPolicyRepository } from './application/interfaces/IPolicyRepository'; // <<< NEW
import { IPolicyService } from './application/interfaces/IPolicyService';
import { IRoleAdminService } from './application/interfaces/IRoleAdminService'; // Added
import { IRoleRepository } from './application/interfaces/IRoleRepository'; // Added
import { IUserAdminService } from './application/interfaces/IUserAdminService';
import { IUserMgmtAdapter } from './application/interfaces/IUserMgmtAdapter';


// --- Import Implementations (Adapters/Services/Infrastructure) ---

// Infrastructure - Adapters
import { CognitoUserMgmtAdapter } from './infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { DynamoDbPolicyEngineAdapter } from './infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter'; // <<< NEW

// Infrastructure - Config & Logging
import { EnvironmentConfigService } from './infrastructure/config/EnvironmentConfigService';
import { WinstonLogger } from './infrastructure/logging/WinstonLogger';

// Infrastructure - Persistence
import { DynamoAssignmentRepository } from './infrastructure/persistence/dynamodb/DynamoAssignmentRepository'; // Added
import { DynamoPolicyRepository } from './infrastructure/persistence/dynamodb/DynamoPolicyRepository'; // Added
import { DynamoDBProvider } from './infrastructure/persistence/dynamodb/dynamodb.client'; // Added
import { DynamoPermissionRepository } from './infrastructure/persistence/dynamodb/DynamoPermissionRepository'; // Added
import { DynamoRoleRepository } from './infrastructure/persistence/dynamodb/DynamoRoleRepository'; // Added
// import { DynamoUserProfileRepository } from './infrastructure/persistence/dynamodb/DynamoUserProfileRepository'; // Assuming this exists if profile mgmt is added later

// Application Services
import { GroupAdminService } from './application/services/group.admin.service';
import { PermissionAdminService } from './application/services/permission.admin.service'; // Added
import { PolicyAdminService } from './application/services/policy.admin.service';
import { PolicyService } from './application/services/PolicyService';
import { RoleAdminService } from './application/services/role.admin.service'; // Added
import { UserAdminService } from './application/services/user.admin.service';


// --- Register Infrastructure Services (Singletons recommended) ---
container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
container.registerSingleton<IConfigService>(TYPES.ConfigService, EnvironmentConfigService);
container.registerSingleton<DynamoDBProvider>(TYPES.DynamoDBProvider, DynamoDBProvider); // Register provider


// --- Register Adapters (Singletons usually appropriate) ---
container.registerSingleton<IUserMgmtAdapter>(TYPES.UserMgmtAdapter, CognitoUserMgmtAdapter);
container.registerSingleton<IPolicyEngineAdapter>(TYPES.PolicyEngineAdapter, DynamoDbPolicyEngineAdapter); // <<< NEW


// --- Register Persistence Repositories (Often Singleton, but can be Transient if stateful/scoped) ---
// Use registerSingleton for stateless repositories connecting to external DBs
container.registerSingleton<IAssignmentRepository>(TYPES.AssignmentRepository, DynamoAssignmentRepository);
container.registerSingleton<IPermissionRepository>(TYPES.PermissionRepository, DynamoPermissionRepository);
container.registerSingleton<IRoleRepository>(TYPES.RoleRepository, DynamoRoleRepository);
container.registerSingleton<IPolicyRepository>(TYPES.PolicyRepository, DynamoPolicyRepository); // <<< NEW
// container.registerSingleton<IUserProfileRepository>(TYPES.UserProfileRepository, DynamoUserProfileRepository); // Example if added


// --- Register Application Services (Singletons often suitable) ---
container.registerSingleton<IUserAdminService>(TYPES.UserAdminService, UserAdminService);
container.registerSingleton<IGroupAdminService>(TYPES.GroupAdminService, GroupAdminService);
container.registerSingleton<IPermissionAdminService>(TYPES.PermissionAdminService, PermissionAdminService);
container.registerSingleton<IRoleAdminService>(TYPES.RoleAdminService, RoleAdminService);
container.registerSingleton<IPolicyAdminService>(TYPES.PolicyAdminService, PolicyAdminService); // <<< NEW
container.registerSingleton<IPolicyService>(TYPES.PolicyService, PolicyService);


// --- Register Controllers (Usually Transient - handled automatically by tsyringe if decorated) ---
// Ensure controllers are decorated with @injectable()
// No explicit registration needed here unless overriding behavior or needing specific scope.
// Examples (make sure these files exist and controllers are @injectable):
// import './api/controllers/group.admin.controller';
// import './api/controllers/permission.admin.controller';
// import './api/controllers/policy.admin.controller'; // <<< Ensure PolicyAdminController is imported for side effects if needed by TSyringe setup
// import './api/controllers/role.admin.controller';
// import './api/controllers/system.controller';
// import './api/controllers/user.admin.controller';


// Export the configured container
export { container };
