import { Policy } from '../../domain/entities/Policy';

export interface IPolicyService {
    getPolicyBundle(tenantId: string): Promise<Buffer>;
    getAllActivePolicies(tenantId: string): Promise<Policy[]>;
}
