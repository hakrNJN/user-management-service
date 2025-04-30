/**
 * Represents a specific Permission within the system.
 * Permissions define what actions can be taken on what resources, potentially with conditions.
 */
export class Permission {
    constructor(
        // Unique identifier for the permission (e.g., 'user:read', 'order:create:own', 'document:edit:projectX')
        // Consider a structured naming convention.
        public readonly permissionName: string,
        public description?: string,
        // Optional: Define explicit action/resource for easier querying/management,
        // though the primary definition might be handled by the policy engine (e.g., CASL rules)
        // public action?: string,
        // public resourceType?: string,
        // public condition?: string, // Or a more structured condition object
        public createdAt: Date = new Date(),
        public updatedAt: Date = new Date()
    ) {}

     /**
     * Updates the mutable properties of the permission.
     * @param updates - An object containing partial updates.
     */
     public update(updates: { description?: string }): void {
        if (updates.description !== undefined) {
            this.description = updates.description;
        }
        // Add updates for other mutable fields if any
        this.updatedAt = new Date();
    }

    /**
     * Factory method to create a Permission instance from a persistence layer object.
     * @param data - Data retrieved from the database.
     */
    public static fromPersistence(data: {
        permissionName: string;
        description?: string;
        createdAt?: string | Date;
        updatedAt?: string | Date;
        // Add other fields if stored
    }): Permission {
        return new Permission(
            data.permissionName,
            data.description,
            // Map other fields if needed
            data.createdAt ? new Date(data.createdAt) : new Date(),
            data.updatedAt ? new Date(data.updatedAt) : new Date()
        );
    }

    /**
     * Converts the Permission entity to a plain object suitable for persistence.
     */
    public toPersistence(): Record<string, any> {
        return {
            permissionName: this.permissionName,
            description: this.description,
            // Map other fields if needed
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
