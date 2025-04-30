import { UserProfile } from '../../domain/entities/UserProfile';

// Define pagination types separately (or move to a shared types file)
// These are NOT part of the core interface contract itself, but describe
// the structure used by methods that implement pagination.
export interface QueryOptions {
  limit?: number;
  startKey?: Record<string, any>; // Represents DynamoDB's LastEvaluatedKey
  indexName?: string; // Still useful for context, though not always needed in params directly
}

export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>; // DynamoDB's LastEvaluatedKey
}


/**
 * Interface for interacting with the user profile data store.
 * Defines methods for retrieving, saving, updating, and deleting user profiles.
 */
export interface IUserProfileRepository {
  /**
   * Finds a user profile by its user ID.
   * @param userId - The ID of the user to find.
   * @returns A promise that resolves to the UserProfile if found, or null if not found.
   */
  findById(userId: string): Promise<UserProfile | null>;

  /**
   * Saves a new user profile to the data store.
   * @param profile - The UserProfile object to save.
   * @returns A promise that resolves when the profile has been saved.
   */
  save(profile: UserProfile): Promise<void>;

  /**
   * Updates an existing user profile in the data store.
   * @param userId - The ID of the user to update.
   * @param updates - An object containing the fields to update and their new values.
   * @returns A promise that resolves when the profile has been updated.
   */
  update(userId: string, updates: Partial<UserProfile>): Promise<void>;
  /**
   * Deletes a user profile from the data store.
   * @param userId - The ID of the user to delete.
   * @returns A promise that resolves when the profile has been deleted.
   */
  delete(userId: string): Promise<void>;
  findByEmail(email: string): Promise<UserProfile | null>; // Add it back (non-optional)
  // Add others like findByPhoneNumber, findByMfaStatus if also required by interface
  findByPhoneNumber(phoneNumber: string): Promise<UserProfile | null>;
  findByMfaStatus(enabled: boolean, options?: QueryOptions): Promise<QueryResult<UserProfile>>;
}