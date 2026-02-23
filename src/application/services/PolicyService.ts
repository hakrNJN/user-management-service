import { injectable, inject } from 'tsyringe';
import { IPolicyService } from '../interfaces/IPolicyService';
import { IPolicyRepository } from '../interfaces/IPolicyRepository';
import { ILogger } from '../interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { Policy } from '../../domain/entities/Policy';
import archiver from 'archiver';
import { PassThrough } from 'stream';

@injectable()
export class PolicyService implements IPolicyService {
    constructor(
        @inject(TYPES.PolicyRepository) private policyRepository: IPolicyRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) {}

    public async getAllActivePolicies(tenantId: string): Promise<Policy[]> {
        this.logger.info('Fetching all active policies');
        // Assuming policyRepository has a method to get all active policies
        // If not, we might need to add one or iterate through all policies
        const policies = await this.policyRepository.getAllPolicies(tenantId); // Assuming this gets all policies, active or not
        return policies.filter(policy => policy.isActive); // Filter for active policies
    }

    public async getPolicyBundle(tenantId: string): Promise<Buffer> {
        this.logger.info('Generating OPA policy bundle');
        const policies = await this.getAllActivePolicies(tenantId);

        const archive = archiver('tar', { gzip: true });
        const output = new PassThrough();

        archive.on('error', (err: any) => {
            this.logger.error('Archive error', { error: err.message });
            output.emit('error', err);
        });

        archive.pipe(output);

        for (const policy of policies) {
            // Assuming policy.regoContent contains the Rego policy string
            archive.append(policy.policyDefinition, { name: `${policy.id}.rego` });
        }

        await archive.finalize();

        return new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            output.on('data', (chunk) => chunks.push(chunk));
            output.on('end', () => resolve(Buffer.concat(chunks)));
            output.on('error', reject);
        });
    }
}
