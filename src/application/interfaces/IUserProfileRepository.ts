// src/application/interfaces/IUserProfileRepository.ts
import { UserProfile } from '../../domain/entities/UserProfile';

export interface IUserProfileRepository {
    save(profile: UserProfile): Promise<void>;
    findById(userId: string): Promise<UserProfile | null>;
    findByEmail(email: string): Promise<UserProfile | null>;
    update(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null>;
    delete(userId: string): Promise<boolean>;
}
