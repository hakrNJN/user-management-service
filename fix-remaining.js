const fs = require('fs');

function replace(file, search, replaceStr) {
    if (!fs.existsSync(file)) {
        console.error("File not found: " + file);
        return;
    }
    let cp = fs.readFileSync(file, 'utf8');
    if (cp.includes(replaceStr)) {
        console.log('Already fixed ' + file);
        return;
    }
    cp = cp.replace(search, replaceStr);
    fs.writeFileSync(file, cp);
    console.log('Fixed ' + file);
}

// 1. IPolicyService
replace('src/application/interfaces/IPolicyService.ts',
    'getPolicyBundle(): Promise<Buffer>;\n    getAllActivePolicies(): Promise<Policy[]>;',
    'getPolicyBundle(tenantId: string): Promise<Buffer>;\n    getAllActivePolicies(tenantId: string): Promise<Policy[]>;');

// 2. PolicyService
replace('src/application/services/PolicyService.ts',
    'public async getAllActivePolicies(): Promise<Policy[]> {',
    'public async getAllActivePolicies(tenantId: string): Promise<Policy[]> {');
replace('src/application/services/PolicyService.ts',
    'public async getPolicyBundle(): Promise<Buffer> {',
    'public async getPolicyBundle(tenantId: string): Promise<Buffer> {');
replace('src/application/services/PolicyService.ts',
    'const policies = await this.getAllActivePolicies();',
    'const policies = await this.getAllActivePolicies(tenantId);');

// 3. IPolicyEngineAdapter
replace('src/application/interfaces/IPolicyEngineAdapter.ts',
    'getPolicyDefinition(policyId: string): Promise<string | null>;',
    'getPolicyDefinition(tenantId: string, policyId: string): Promise<string | null>;');
replace('src/application/interfaces/IPolicyEngineAdapter.ts',
    'deletePolicyDefinition(policyId: string): Promise<void>;',
    'deletePolicyDefinition(tenantId: string, policyId: string): Promise<void>;');

// 4. DynamoDbPolicyEngineAdapter
replace('src/infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter.ts',
    'async getPolicyDefinition(policyId: string): Promise<string | null> {',
    'async getPolicyDefinition(tenantId: string, policyId: string): Promise<string | null> {');
replace('src/infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter.ts',
    'async deletePolicyDefinition(policyId: string): Promise<void> {',
    'async deletePolicyDefinition(tenantId: string, policyId: string): Promise<void> {');

// 5. MongoUserProfileRepository
replace('src/infrastructure/persistence/mongo/MongoUserProfileRepository.ts',
    'async update(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {',
    'async update(tenantId: string, id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {');

// 6. FirestoreUserProfileRepository
replace('src/infrastructure/persistence/firestore/FirestoreUserProfileRepository.ts',
    'async update(id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {',
    'async update(tenantId: string, id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {');

// 7. PolicyController
replace('src/api/controllers/policy.controller.ts',
    "const bundle = await this.policyService.getPolicyBundle();",
    "const tenantId = (req.query.tenantId as string) || 'default-tenant';\n            const bundle = await this.policyService.getPolicyBundle(tenantId);");

console.log("Remaining fixes script complete.");
