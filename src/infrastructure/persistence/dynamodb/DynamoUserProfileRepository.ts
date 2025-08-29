// src/infrastructure/persistence/dynamodb/DynamoUserProfileRepository.ts
import { inject, injectable } from 'tsyringe';
import { IUserProfileRepository } from '../../../application/interfaces/IUserProfileRepository';
import { UserProfile } from '../../../domain/entities/UserProfile';
import { TYPES } from '../../../shared/constants/types';
import { DynamoDBProvider } from './dynamodb.client';
import { GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ILogger } from '../../../application/interfaces/ILogger';
import { IConfigService } from '../../../application/interfaces/IConfigService';

@injectable()
export class DynamoUserProfileRepository implements IUserProfileRepository {
    private readonly tableName: string;

    constructor(
        @inject(TYPES.DynamoDBProvider) private readonly dbProvider: DynamoDBProvider,
        @inject(TYPES.Logger) private readonly logger: ILogger,
        @inject(TYPES.ConfigService) private readonly configService: IConfigService,
    ) {
        this.tableName = this.configService.getOrThrow('AUTHZ_TABLE_NAME');
    }

    async save(profile: UserProfile): Promise<void> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: profile,
        });
        await this.dbProvider.documentClient.send(command);
    }

    async findById(userId: string): Promise<UserProfile | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: { userId },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Item ? (result.Item as UserProfile) : null;
    }

    async findByEmail(email: string): Promise<UserProfile | null> {
        const command = new QueryCommand({
            TableName: this.tableName,
            IndexName: 'email-index', // Assuming a GSI on the email field
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Items && result.Items.length > 0 ? (result.Items[0] as UserProfile) : null;
    }

    async update(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
        const updateExpression = Object.keys(updates)
            .map((key, index) => `${key} = :value${index}`)
            .join(', ');
        const expressionAttributeValues = Object.entries(updates).reduce((acc, [key, value], index) => {
            acc[`:value${index}`] = value;
            return acc;
        }, {} as Record<string, any>);

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: { userId },
            UpdateExpression: `SET ${updateExpression}`,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const result = await this.dbProvider.documentClient.send(command);
        return result.Attributes ? (result.Attributes as UserProfile) : null;
    }

    async delete(userId: string): Promise<boolean> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: { userId },
        });
        await this.dbProvider.documentClient.send(command);
        return true;
    }
}