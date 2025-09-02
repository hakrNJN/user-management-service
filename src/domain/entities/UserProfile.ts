// src/domain/entities/UserProfile.ts
export class UserProfile {
    constructor(
        public userId: string,
        public email: string,
        public firstName: string,
        public lastName: string,
        public phoneNumber?: string,
        public createdAt: Date = new Date(),
        public updatedAt: Date = new Date(),
    ) {}

    public toPersistence(): Record<string, any> {
        return {
            userId: this.userId,
            email: this.email,
            firstName: this.firstName,
            lastName: this.lastName,
            phoneNumber: this.phoneNumber,
            createdAt: this.createdAt.toISOString(), // Convert Date to ISO string
            updatedAt: this.updatedAt.toISOString(), // Convert Date to ISO string
        };
    }

    public static fromPersistence(data: Record<string, any>): UserProfile {
        const profile = new UserProfile(
            data.userId,
            data.email,
            data.firstName,
            data.lastName,
            data.phoneNumber,
            new Date(data.createdAt),
            new Date(data.updatedAt)
        );
        return profile;
    }
}