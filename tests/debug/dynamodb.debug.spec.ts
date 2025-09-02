import 'reflect-metadata';
import { createTestTable, deleteTestTable, destroyDynamoDBClient } from '../helpers/dynamodb.helper';
import { persistenceContainer } from '../helpers/persistence.helper';
import { IConfigService } from '@src/application/interfaces/IConfigService';
import { TYPES } from '@src/shared/constants/types';
import { DynamoDBProvider } from '@src/infrastructure/persistence/dynamodb/dynamodb.client';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { IRoleRepository } from '@src/application/interfaces/IRoleRepository';
import { Role } from '@src/domain/entities/Role';
import { DynamoRoleRepository } from '@src/infrastructure/persistence/dynamodb/DynamoRoleRepository';

describe('DynamoDB Table Creation Debug Test', () => {
    let configService: IConfigService;

    beforeAll(async () => {
        configService = persistenceContainer.resolve<IConfigService>(TYPES.ConfigService);
        const tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        await createTestTable(tableName);

        // Register the real repository implementation in our test container
        persistenceContainer.register<IRoleRepository>(TYPES.RoleRepository, {
            useClass: DynamoRoleRepository,
        });
    }, 30000);

    afterAll(async () => {
        const tableName = configService.getOrThrow('AUTHZ_TABLE_NAME');
        await deleteTestTable(tableName);
        destroyDynamoDBClient();
        persistenceContainer.clearInstances();
    }, 30000);

    it('should successfully create and delete the test table', () => {
        expect(true).toBe(true);
    });

    it('should resolve DynamoDBProvider and list tables', async () => {
        const dbProvider = persistenceContainer.resolve<DynamoDBProvider>(TYPES.DynamoDBProvider);
        const client = dbProvider.client;
        const command = new ListTablesCommand({});
        const result = await client.send(command);
        expect(result.TableNames).toContain(configService.getOrThrow('AUTHZ_TABLE_NAME'));
    });

    it('should create a role using DynamoRoleRepository', async () => {
        const roleRepository = persistenceContainer.resolve<IRoleRepository>(TYPES.RoleRepository);
        const testRole = new Role('debug-role', 'Debug Role Description');
        await expect(roleRepository.create(testRole)).resolves.not.toThrow();

        // Verify by fetching
        const found = await roleRepository.findByName(testRole.roleName);
        expect(found).toBeInstanceOf(Role);
        expect(found?.roleName).toBe(testRole.roleName);
    });
});