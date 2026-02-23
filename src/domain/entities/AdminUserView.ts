import { AttributeType, UserStatusType } from "@aws-sdk/client-cognito-identity-provider";

/**
 * Represents a simplified view of a user suitable for administrative listings or displays.
 * This is a Domain Entity, mapping data from the IdP (via Adapter) to a structured object.
 */
export class AdminUserView {
    constructor(
        public readonly tenantId: string,
        public readonly userId: string, // Typically the 'sub' attribute
        public readonly username: string,
        public readonly status: UserStatusType | string, // e.g., CONFIRMED, UNCONFIRMED, ARCHIVED, UNKNOWN
        public readonly enabled: boolean,
        public readonly email: string | undefined,
        public readonly emailVerified: boolean,
        public readonly phoneNumber: string | undefined,
        public readonly phoneVerified: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly attributes: Record<string, string>, // All other attributes
        public readonly groups: string[] = [] // Groups the user belongs to
    ) { }

    /**
     * Factory method to create an AdminUserView instance from Cognito's UserType.
     * @param cognitoUser - The UserType object from Cognito Admin ListUsers/GetUser.
     * @param userGroups - Optional array of group names the user belongs to.
     * @returns An instance of AdminUserView.
     */
    public static fromCognitoUser(tenantId: string, cognitoUser: {
        Username?: string;
        Attributes?: AttributeType[];
        UserStatus?: UserStatusType | string;
        Enabled?: boolean;
        UserCreateDate?: Date;
        UserLastModifiedDate?: Date;
    }, userGroups?: string[]): AdminUserView {

        const attributesMap: Record<string, string> = {};
        let email: string | undefined;
        let emailVerified = false;
        let phoneNumber: string | undefined;
        let phoneVerified = false;
        let userId: string | undefined; // Usually 'sub'

        cognitoUser.Attributes?.forEach(attr => {
            if (attr.Name && attr.Value) {
                attributesMap[attr.Name] = attr.Value;
                switch (attr.Name) {
                    case 'sub':
                        userId = attr.Value;
                        break;
                    case 'email':
                        email = attr.Value;
                        break;
                    case 'email_verified':
                        emailVerified = attr.Value.toLowerCase() === 'true';
                        break;
                    case 'phone_number':
                        phoneNumber = attr.Value;
                        break;
                    case 'phone_number_verified':
                        phoneVerified = attr.Value.toLowerCase() === 'true';
                        break;
                }
            }
        });

        // Use 'sub' as primary ID, fallback to username if 'sub' is missing (shouldn't happen normally)
        const finalUserId = userId ?? cognitoUser.Username ?? 'unknown-id';
        if (!userId && cognitoUser.Username) {
            console.warn(`Cognito user missing 'sub' attribute, using username as ID: ${cognitoUser.Username}`);
        }

        return new AdminUserView(
            tenantId,
            finalUserId,
            cognitoUser.Username ?? 'unknown-username',
            cognitoUser.UserStatus ?? 'UNKNOWN',
            cognitoUser.Enabled ?? false,
            email,
            emailVerified,
            phoneNumber,
            phoneVerified,
            cognitoUser.UserCreateDate ?? new Date(0), // Use epoch if missing
            cognitoUser.UserLastModifiedDate ?? new Date(0), // Use epoch if missing
            attributesMap, // Include all attributes
            userGroups ?? [] // Assign groups if provided
        );
    }
}
