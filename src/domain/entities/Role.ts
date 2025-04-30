/**
 * Represents an authorization Role within the system.
 * Roles group together permissions and can be assigned to Groups or Users.
 */
export class Role {
    constructor(
        // Unique name for the role (e.g., 'document-editor', 'billing-admin')
        public readonly roleName: string,
        public description?: string,
        public createdAt: Date = new Date(),
        public updatedAt: Date = new Date()
        // Add other relevant properties if needed
    ) {}

    /**
     * Updates the mutable properties of the role.
     * @param updates - An object containing partial updates.
     */
    public update(updates: { description?: string }): void {
        if (updates.description !== undefined) {
            this.description = updates.description;
        }
        this.updatedAt = new Date();
    }

    /**
     * Factory method to create a Role instance from a persistence layer object.
     * @param data - Data retrieved from the database.
     */
    public static fromPersistence(data: {
        roleName: string;
        description?: string;
        createdAt?: string | Date;
        updatedAt?: string | Date;
    }): Role {
        return new Role(
            data.roleName,
            data.description,
            data.createdAt ? new Date(data.createdAt) : new Date(),
            data.updatedAt ? new Date(data.updatedAt) : new Date()
        );
    }

    /**
     * Converts the Role entity to a plain object suitable for persistence.
     */
    public toPersistence(): Record<string, any> {
        return {
            roleName: this.roleName,
            description: this.description,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
