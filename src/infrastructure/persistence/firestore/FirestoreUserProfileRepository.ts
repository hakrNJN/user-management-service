import { IUserProfileRepository } from '../../../application/interfaces/IUserProfileRepository';
import { UserProfile } from '../../../domain/entities/UserProfile';

export class FirestoreUserProfileRepository implements IUserProfileRepository {
    async save(item: UserProfile): Promise<void> {
        throw new Error('Firestore save pending. Install firebase-admin.');
    }

    async findById(id: string): Promise<UserProfile | null> {
        throw new Error('Firestore findById pending. Install firebase-admin.');
    }

    async findAll(): Promise<UserProfile[]> {
        throw new Error('Firestore findAll pending. Install firebase-admin.');
    }

    async findByEmail(email: string): Promise<UserProfile | null> {
        throw new Error('Firestore findByEmail pending. Install firebase-admin.');
    }

    async update(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
        throw new Error('Firestore update pending. Install firebase-admin.');
    }

    async delete(id: string): Promise<boolean> {
        throw new Error('Firestore delete pending. Install firebase-admin.');
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
