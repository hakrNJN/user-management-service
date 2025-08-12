import { Policy } from '../../domain/entities/Policy';

export interface IPolicyService {
    getPolicyBundle(): Promise<Buffer>;
    getAllActivePolicies(): Promise<Policy[]>;
}
