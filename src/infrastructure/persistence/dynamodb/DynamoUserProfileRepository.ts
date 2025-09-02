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
import { BaseError } from '../../../shared/errors/BaseError'; // Assuming BaseError is defined here
import { UserProfileExistsError } from '../../../domain/exceptions/UserManagementError'; // Assuming this error is defined

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
            Item: profile.toPersistence(),
            ConditionExpression: 'attribute_not_exists(userId)' // Ensure userId does not exist
        });
        try {
            await this.dbProvider.documentClient.send(command);
        } catch (error: any) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to save user profile, userId already exists: ${profile.userId}`);
                throw new UserProfileExistsError(profile.userId);
            }
            this.logger.error(`Error saving user profile ${profile.userId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to save user profile: ${error.message}`);
        }
    }

    async findById(userId: string): Promise<UserProfile | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: { userId },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Item ? UserProfile.fromPersistence(result.Item) : null;
    }

    async findByEmail(email: string): Promise<UserProfile | null> {
        const command = new QueryCommand({
            TableName: this.tableName,
            IndexName: 'email-index', // Assuming a GSI on the email field
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email },
        });
        const result = await this.dbProvider.documentClient.send(command);
        return result.Items && result.Items.length > 0 ? UserProfile.fromPersistence(result.Items[0]) : null;
    }

    async update(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
        const updateExpressionParts: string[] = [];
        const expressionAttributeValues: Record<string, any> = {};
        let index = 0;

        for (const [key, value] of Object.entries(updates)) {
            updateExpressionParts.push(`${key} = :value${index}`);
            expressionAttributeValues[`:value${index}`] = value;
            index++;
        }

        // Always update the updatedAt timestamp
        updateExpressionParts.push(`updatedAt = :updatedAt`);
        expressionAttributeValues[`:updatedAt`] = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: { userId },
            UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(userId)', // Ensure the item exists
            ReturnValues: 'ALL_NEW',
        });

        try {
            const result = await this.dbProvider.documentClient.send(command);
            return result.Attributes ? UserProfile.fromPersistence(result.Attributes) : null;
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                this.logger.warn(`Failed to update user profile, not found: ${userId}`);
                return null; // Return null if the item didn't exist
            }
            this.logger.error(`Error updating user profile ${userId}`, error);
            throw new BaseError('DatabaseError', 500, `Failed to update user profile: ${error.message}`);
        }
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