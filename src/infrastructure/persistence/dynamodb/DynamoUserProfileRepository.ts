// src/infrastructure/persistence/dynamodb/DynamoUserProfileRepository.ts
import { inject, injectable } from 'tsyringe';
import { IUserProfileRepository } from '../../../application/interfaces/IUserProfileRepository';
import { UserProfile } from '../../../domain/entities/UserProfile';
import { TYPES } from '../../../shared/constants/types';
import { DynamoDBProvider } from './dynamodb.client';
import { GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { ILogger } from '../../../application/interfaces/ILogger';
import { IConfigService } from '../../../application/interfaces/IConfigService';
import { BaseError } from '../../../shared/errors/BaseError';
import { UserProfileExistsError } from '../../../domain/exceptions/UserManagementError';

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

    private getPK(tenantId: string): string {
        return `TENANT#${tenantId}`;
    }

    private getSK(userId: string): string {
        return `USER#${userId}`;
    }

    async save(profile: UserProfile): Promise<void> {
        const item = {
            ...profile.toPersistence(),
            PK: this.getPK(profile.tenantId),
            SK: this.getSK(profile.userId),
            EntityTypeGSI_PK: 'USER',
            EntityTypeGSI_SK: profile.createdAt.toISOString()
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        });

        try {
            await this.dbProvider.documentClient.send(command);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to save user profile, userId already exists: ${profile.userId} in tenant ${profile.tenantId}`);
                throw new UserProfileExistsError(profile.userId);
            }
            this.logger.error(`Error saving user profile ${profile.userId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to save user profile: ${error.message}`);
        }
    }

    async findById(tenantId: string, userId: string): Promise<UserProfile | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: this.getPK(tenantId),
                SK: this.getSK(userId)
            },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Item ? UserProfile.fromPersistence(result.Item) : null;
    }

    async findByEmail(tenantId: string, email: string): Promise<UserProfile | null> {
        // Query the email-index (Hash Key: email) and filter by the correct tenant PK
        const command = new QueryCommand({
            TableName: this.tableName,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            FilterExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':email': email,
                ':pk': this.getPK(tenantId)
            },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Items && result.Items.length > 0 ? UserProfile.fromPersistence(result.Items[0]) : null;
    }

    async update(tenantId: string, userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
        const updateExpressionParts: string[] = [];
        const expressionAttributeValues: Record<string, any> = {};
        let index = 0;

        for (const [key, value] of Object.entries(updates)) {
            updateExpressionParts.push(`${key} = :value${index}`);
            expressionAttributeValues[`:value${index}`] = value;
            index++;
        }

        updateExpressionParts.push(`updatedAt = :updatedAt`);
        expressionAttributeValues[`:updatedAt`] = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: this.getPK(tenantId),
                SK: this.getSK(userId)
            },
            UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
            ReturnValues: 'ALL_NEW',
        });

        try {
            const result = await this.dbProvider.documentClient.send(command);
            return result.Attributes ? UserProfile.fromPersistence(result.Attributes) : null;
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to update user profile, not found: ${userId}`);
                return null;
            }
            this.logger.error(`Error updating user profile ${userId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to update user profile: ${error.message}`);
        }
    }

    async delete(tenantId: string, userId: string): Promise<boolean> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: this.getPK(tenantId),
                SK: this.getSK(userId)
            },
        });
        await this.dbProvider.documentClient.send(command);
        return true;
    }

    async findAll(tenantId: string): Promise<UserProfile[]> {
        // Now leveraging the Multi-Tenant Main Table structure perfectly
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': this.getPK(tenantId),
                ':skPrefix': 'USER#'
            },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return (result.Items || []).map(item => UserProfile.fromPersistence(item));
    }
}