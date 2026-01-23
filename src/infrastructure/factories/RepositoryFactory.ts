import { inject, injectable } from 'tsyringe';
import { IRepository } from '../../application/interfaces/IRepository';
import { IUserProfileRepository } from '../../application/interfaces/IUserProfileRepository'; // Extend generic?
import { IConfigService } from '../../application/interfaces/IConfigService';
import { TYPES } from '../../shared/constants/types';
import { DynamoUserProfileRepository } from '../persistence/dynamodb/DynamoUserProfileRepository';
import { FirestoreUserProfileRepository } from '../persistence/firestore/FirestoreUserProfileRepository';
import { MongoUserProfileRepository } from '../persistence/mongo/MongoUserProfileRepository';

@injectable()
export class RepositoryFactory {
    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(DynamoUserProfileRepository) private dynamoUserRepo: DynamoUserProfileRepository,
        @inject(FirestoreUserProfileRepository) private firestoreUserRepo: FirestoreUserProfileRepository,
        @inject(MongoUserProfileRepository) private mongoUserRepo: MongoUserProfileRepository,
    ) { }

    public getUserRepository(): IUserProfileRepository & IRepository<any> {
        const provider = this.configService.get<string>('DB_PROVIDER') || 'DYNAMODB';

        switch (provider.toUpperCase()) {
            case 'DYNAMODB':
                return this.dynamoUserRepo;
            case 'FIRESTORE':
                return this.firestoreUserRepo;
            case 'MONGO':
                return this.mongoUserRepo;
            // Azure Cosmos (Mongo API) can use MONGO provider
            case 'AZURE_COSMOS':
                return this.mongoUserRepo;
            default:
                throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
        }
    }

}
