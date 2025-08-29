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
}
