import { IUserProfileRepository } from '../../../application/interfaces/IUserProfileRepository';
import { UserProfile } from '../../../domain/entities/UserProfile';

export class MongoUserProfileRepository implements IUserProfileRepository {
    async save(item: UserProfile): Promise<void> {
        throw new Error('Mongo save pending. Install mongoose or mongodb.');
    }

    async findById(id: string): Promise<UserProfile | null> {
        throw new Error('Mongo findById pending.');
    }

    async findAll(): Promise<UserProfile[]> {
        throw new Error('Mongo findAll pending.');
    }

    async findByEmail(email: string): Promise<UserProfile | null> {
        throw new Error('Mongo findByEmail pending.');
    }

    async update(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
        throw new Error('Mongo update pending.');
    }

    async delete(id: string): Promise<boolean> {
        throw new Error('Mongo delete pending.');
    }
}
