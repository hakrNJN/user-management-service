/**
 * Generic Repository Interface for Universal Architecture.
 * This contract ensures all database implementations (DynamoDB, Firestore, Mongo) support standard CRUD operations.
 */
export interface IRepository<T> {
    save(item: T): Promise<void>;
    findById(id: string): Promise<T | null>;
    findAll?(): Promise<T[]>;
    update(id: string, updates: Partial<T>): Promise<T | null>;
    delete(id: string): Promise<boolean>;

    // Optional: Generic query method if needed, though strictly typed methods in specific repo interfaces are better
    // query(filter: Partial<T>): Promise<T[]>;
}
