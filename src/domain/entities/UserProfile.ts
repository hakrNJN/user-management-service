//src/domain/entities/UserProfile.ts

/**
 * Represents the type of Multi-Factor Authentication (MFA) used by a user.
 */
export type MFAType = 'SMS' | 'TOTP' | 'None';

/**
 * Represents a user's profile information.
 */
export class UserProfile {
  /**
   * Creates a new UserProfile instance.
   * @param userId - The unique identifier of the user.
   * @param email - The user's email address.
   * @param firstName - The user's first name.
   * @param lastName - The user's last name.
   * @param phoneNumber - The user's phone number (optional).
   * @param emailVerified - Indicates if the user's email has been verified. Defaults to false.
   * @param phoneVerified - Indicates if the user's phone number has been verified. Defaults to false.
   * @param mfaEnabled - Indicates if Multi-Factor Authentication is enabled for the user. Defaults to false.
   * @param preferredMFA - The user's preferred MFA method. Defaults to 'None'.
   * @param createdAt - The date and time when the user profile was created. Defaults to the current date and time.
   * @param updatedAt - The date and time when the user profile was last updated. Defaults to the current date and time.
   */
  constructor(
    public readonly userId: string, // The unique identifier of the user.
    public email: string, // The user's email address.
    public firstName: string, // The user's first name.
    public lastName: string, // The user's last name.
    public phoneNumber?: string, // The user's phone number (optional).
    public emailVerified: boolean = false, // Indicates if the user's email has been verified.
    public phoneVerified: boolean = false, // Indicates if the user's phone number has been verified.
    public mfaEnabled: boolean = false, // Indicates if Multi-Factor Authentication is enabled for the user.
    public preferredMFA: MFAType = 'None', // The user's preferred MFA method.
    public createdAt: Date = new Date(), // The date and time when the user profile was created.
    public updatedAt: Date = new Date(), // The date and time when the user profile was last updated.
  ) {}

  /**
   * Updates the user profile with the provided updates.
   *
   * @param updates - An object containing the properties to update.
   *                  Only the properties present in this object will be updated.
   *                  The `updatedAt` property will be automatically updated to the current date and time.
   * @example
   * ```typescript
   * const userProfile = new UserProfile('123', 'test@example.com', 'John', 'Doe');
   * userProfile.update({ firstName: 'Jane', phoneNumber: '1234567890' });
   * ```
   */
  public update(updates: Partial<UserProfile>): void {
    Object.assign(this, { ...updates, updatedAt: new Date() });
  }

  /**
   * Returns the user's full name.
   * @returns The user's full name (first name followed by last name).
   *          Returns an empty string if both first and last names are empty.
   */
  public getFullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}