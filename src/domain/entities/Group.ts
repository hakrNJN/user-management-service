import { GroupType as CognitoGroupType } from "@aws-sdk/client-cognito-identity-provider";

/**
 * Represents a Group (or Role) within the identity system.
 * Maps data from the IdP's GroupType to a domain entity.
 */
export class Group {
    constructor(
        public readonly groupName: string,
        public readonly description: string | undefined,
        public readonly precedence: number | undefined,
        public readonly creationDate: Date | undefined,
        public readonly lastModifiedDate: Date | undefined
        // public readonly roleArn: string | undefined // Include if using IAM roles with groups
    ) {}

    /**
     * Factory method to create a Group instance from Cognito's GroupType.
     */
    public static fromCognitoGroup(cognitoGroup: CognitoGroupType): Group {
        return new Group(
            cognitoGroup.GroupName ?? 'unknown-group',
            cognitoGroup.Description,
            cognitoGroup.Precedence,
            cognitoGroup.CreationDate,
            cognitoGroup.LastModifiedDate
            // cognitoGroup.RoleArn
        );
    }
}
