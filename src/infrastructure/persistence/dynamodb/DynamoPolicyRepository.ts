
    async getPolicyVersion(policyId: string, version: number): Promise<Policy | null> {
        // TODO: Implement this using a GSI on policyId and version for performance.
        this.logger.warn(`Getting policy version using Scan. Implement GSI for performance.`);

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND id = :id AND version = :version",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":id": policyId,
                ":version": version
            }),
            Limit: 1
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return null;
            }
            return this.mapToPolicy(result.Items[0]);
        } catch (error: any) {
            this.logger.error(`Error finding policy version ${version} for policy ID ${policyId} using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to find policy version: ${error.message}`);
        }
    }

    async listPolicyVersions(policyId: string): Promise<Policy[]> {
        // TODO: Implement this using a GSI on policyId for performance.
        this.logger.warn(`Listing policy versions using Scan. Implement GSI for performance.`);

        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type AND id = :id",
            ExpressionAttributeValues: marshall({
                ":type": "Policy",
                ":id": policyId
            }),
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map(item => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error(`Error listing policy versions for policy ID ${policyId} using Scan`, error);
            throw new BaseError('DatabaseError', 500, `Failed to list policy versions: ${error.message}`);
        }
    }

    async getAllPolicies(): Promise<Policy[]> {
        this.logger.info('Fetching all policies from DynamoDB.');
        const commandInput: ScanCommandInput = {
            TableName: this.tableName,
            FilterExpression: "EntityType = :type",
            ExpressionAttributeValues: marshall({
                ":type": "Policy"
            }),
        };
        const command = new ScanCommand(commandInput);

        try {
            const result = await this.client.send(command);
            if (!result.Items || result.Items.length === 0) {
                return [];
            }
            return result.Items.map(item => this.mapToPolicy(item));
        } catch (error: any) {
            this.logger.error('Error fetching all policies from DynamoDB', error);
            throw new BaseError('DatabaseError', 500, `Failed to fetch all policies: ${error.message}`);
        }
    }
}
