import { UserProfile } from '../../domain/entities/UserProfile';
import { IRepository } from './IRepository';

export interface IUserProfileRepository extends IRepository<UserProfile> {
    // Specific methods beyond generic CRUD
    findByEmail(tenantId: string, email: string): Promise<UserProfile | null>;
}
