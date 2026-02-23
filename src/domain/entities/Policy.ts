// Add near top of Policy.ts or import from a shared location if preferred
interface PolicyDynamoItem {
    PK: string;
    SK: string;
    tenantId: string;
    EntityType: 'Policy';
    id: string;
    policyName: string;
    policyDefinition: string;
    policyLanguage: string;
    description?: string;
    version: number;
    metadata?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
}


/**
 * Represents a policy definition within the system (e.g., a Rego module).
 * This entity holds the policy's metadata and its definition content.
 */
export class Policy {
    constructor(
        public readonly tenantId: string,
        /** Unique identifier for the policy (e.g., UUID). */
        public readonly id: string,
        /** Unique, human-readable and machine-usable name (e.g., 'policy.users.read_own_profile'). */
        public policyName: string,
        /** The actual policy code/definition as a string. */
        public policyDefinition: string,
        /** The language of the policy definition (e.g., 'rego', 'cedar'). */
        public policyLanguage: string,
        /** The version of the policy. */
        public version: number,
        /** Optional description of the policy's purpose. */
        public description?: string,
        /** Optional metadata (e.g., tags, owner, related resources). */
        public metadata?: Record<string, any>,
        /** Timestamp of creation. */
        public createdAt: Date = new Date(),
        /** Timestamp of the last update. */
        public updatedAt: Date = new Date(),
        public isActive: boolean = true
    ) { }

    /**
     * Updates mutable properties of the policy.
     * @param updates - An object containing partial updates.
     */
    public update(updates: {
        policyName?: string;
        description?: string;
        policyDefinition?: string;
        policyLanguage?: string;
        metadata?: Record<string, any>;
    }): void {
        if (updates.policyName !== undefined) this.policyName = updates.policyName;
        // Allow explicitly setting description to undefined or an empty string
        if (updates.description !== undefined) this.description = updates.description || undefined;
        if (updates.policyDefinition !== undefined) this.policyDefinition = updates.policyDefinition;
        if (updates.policyLanguage !== undefined) this.policyLanguage = updates.policyLanguage;
        if (updates.metadata !== undefined) this.metadata = updates.metadata;

        this.updatedAt = new Date();
    }

    /**
     * Factory method to create a Policy instance from a persistence layer object.
     * @param data - Data retrieved from the database.
     */
    public static fromPersistence(data: {
        tenantId: string;
        id: string;
        policyName: string;
        policyDefinition: string;
        policyLanguage: string;
        version: number;
        description?: string;
        metadata?: Record<string, any>;
        createdAt?: string | Date;
        updatedAt?: string | Date;
        isActive?: boolean;
    }): Policy {
        // Basic validation within the factory
        if (!data.id || !data.policyName || !data.policyDefinition || !data.policyLanguage) {
            throw new Error("Cannot create Policy from persistence: Missing required fields (id, policyName, policyDefinition, policyLanguage).");
        }
        return new Policy(
            data.tenantId,
            data.id,
            data.policyName,
            data.policyDefinition,
            data.policyLanguage,
            data.version,
            data.description,
            data.metadata,
            data.createdAt ? new Date(data.createdAt) : new Date(),
            data.updatedAt ? new Date(data.updatedAt) : new Date(),
            data.isActive ?? true
        );
    }

    /**
     * Converts the Policy entity to a plain object suitable for persistence.
     * Uses a more specific return type.
     */
    public toPersistence(): Omit<PolicyDynamoItem, 'PK' | 'SK' | 'EntityType'> {
        return {
            tenantId: this.tenantId,
            id: this.id,
            policyName: this.policyName,
            policyDefinition: this.policyDefinition,
            policyLanguage: this.policyLanguage,
            description: this.description,
            version: this.version,
            metadata: this.metadata,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
            isActive: this.isActive,
        };
    }
}