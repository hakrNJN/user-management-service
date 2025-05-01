import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { container } from "../../../container"; // Alternative: Resolve from container
// import { TYPES } from "../../../shared/constants/types"; // Alternative: Resolve from container

/**
 * Creates and configures an AWS DynamoDB Client.
 *
 * Recommended Approach: Inject IConfigService via DI into a provider class or the repository/service
 * that needs the client, rather than exporting a globally configured instance directly from this file.
 *
 * This example exports a configured instance directly using environment variables
 * for simplicity, but DI is generally preferred for testability and flexibility.
 */

// --- Direct Configuration Approach (Simpler, less flexible) ---
const region = process.env.AWS_REGION;

// if (!region) {
//     console.warn('AWS_REGION environment variable not set. DynamoDB client might not function correctly.');
//     // Depending on where this runs, it might still work if region is configured elsewhere (e.g., ~/.aws/config, EC2 metadata)
// }

// Configure the client
// The SDK automatically attempts to find credentials in the standard chain:
// 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
// 2. Shared credential file (~/.aws/credentials)
// 3. AWS config file (~/.aws/config)
// 4. EC2 instance profile or ECS task role (Recommended for AWS environments)
// const dynamoDbClient = new DynamoDBClient({
//     region: region,
//     // Add other configurations like endpoint override for local testing (DynamoDB Local)
//     // endpoint: process.env.DYNAMODB_ENDPOINT_URL || undefined,
// });

// console.info(`DynamoDB Client initialized for region: ${region || 'unknown (relying on SDK default)'}`);

// export { dynamoDbClient };


// --- DI Approach (More robust - illustrative example, implement in provider/service) ---

import { inject, injectable } from 'tsyringe';
import { IConfigService } from "../../../application/interfaces/IConfigService";
import { TYPES } from "../../../shared/constants/types";

@injectable()
export class DynamoDBProvider {
    public readonly client: DynamoDBClient;

    constructor(@inject(TYPES.ConfigService) private configService: IConfigService) {
        const region = this.configService.getOrThrow<string>('AWS_REGION');
        if (!region) {
            throw new Error('AWS_REGION configuration is missing for DynamoDB client.');
        }
        this.client = new DynamoDBClient({ region });
    }
}

// Then register DynamoDBProvider in container.ts and inject it where needed.