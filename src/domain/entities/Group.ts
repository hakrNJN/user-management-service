import { GroupType as CognitoGroupType } from "@aws-sdk/client-cognito-identity-provider";

export type GroupStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Represents a Group (or Role) within the identity system.
 * Maps data from the IdP's GroupType to a domain entity.
 */
export class Group {
    constructor(
        public readonly groupName: string,
        public description: string,
        public status: GroupStatus,
        public readonly precedence: number | undefined,
        public readonly creationDate: Date | undefined,
        public readonly lastModifiedDate: Date | undefined
    ) {}

    /**
     * Factory method to create a Group instance from Cognito's GroupType.
     * It parses the description field to extract the user-defined description and the group's status.
     * This is a workaround for Cognito not having a native status field for groups.
     * The description is expected to be a JSON string like: {"description":"Sales Team","status":"ACTIVE"}
     * If parsing fails, it defaults to the original description and an 'ACTIVE' status for backward compatibility.
     */
    public static fromCognitoGroup(cognitoGroup: CognitoGroupType): Group {
        let description = cognitoGroup.Description ?? '';
        let status: GroupStatus = 'ACTIVE';

        if (cognitoGroup.Description?.startsWith('{')) {
            try {
                const parsed = JSON.parse(cognitoGroup.Description);
                description = parsed.description || '';
                status = parsed.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
            } catch (e) {
                // It's not a JSON object, so we treat the whole description as the description.
                description = cognitoGroup.Description ?? '';
                status = 'ACTIVE';
            }
        }

        return new Group(
            cognitoGroup.GroupName ?? 'unknown-group',
            description,
            status,
            cognitoGroup.Precedence,
            cognitoGroup.CreationDate,
            cognitoGroup.LastModifiedDate
        );
    }
}