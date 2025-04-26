// --- Mocks & Interfaces (Placeholders - adjust to your actual project structure) ---

// Domain Entity (Example)
interface User {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roles: string[];
    createdAt: Date;
    updatedAt: Date;
}

// DTOs (Examples)
interface CreateUserDto {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roles?: string[];
}

interface UpdateUserDto {
    firstName?: string;
    lastName?: string;
    roles?: string[];
    // Usually password/email are updated via separate, more secure flows
}

// Repository Interface (Example)
interface IUserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findAll(options?: any): Promise<User[]>; // Add options if you have pagination/filtering
    create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
    update(id: string, data: Partial<User>): Promise<User | null>;
    delete(id: string): Promise<boolean>; // Returns true if deleted, false otherwise
}

// Password Hasher Interface (Example)
interface IPasswordHasher {
    hash(password: string): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
}

// Custom Errors (Examples)
class UserNotFoundError extends Error {
    constructor(id: string) {
        super(`User with ID ${id} not found.`);
        this.name = 'UserNotFoundError';
    }
}
class UserAlreadyExistsError extends Error {
    constructor(email: string) {
        super(`User with email ${email} already exists.`);
        this.name = 'UserAlreadyExistsError';
    }
}
class InvalidPasswordError extends Error {
    constructor() {
        super('Invalid password provided.');
        this.name = 'InvalidPasswordError';
    }
}

// --- End Mocks & Interfaces ---
