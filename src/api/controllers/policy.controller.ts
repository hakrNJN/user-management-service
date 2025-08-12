import { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { IPolicyService } from '../../application/interfaces/IPolicyService';
import { TYPES } from '../../shared/constants/types';
import { ILogger } from '../../application/interfaces/ILogger';

export class PolicyController {
    private readonly policyService: IPolicyService;
    private readonly logger: ILogger;

    constructor() {
        this.policyService = container.resolve<IPolicyService>(TYPES.PolicyService);
        this.logger = container.resolve<ILogger>(TYPES.Logger);
    }

    public async getPolicyBundle(req: Request, res: Response, next: NextFunction) {
        try {
            this.logger.info('Fetching policy bundle');
            const bundle = await this.policyService.getPolicyBundle();

            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Disposition', 'attachment; filename="bundle.tar.gz"');
            res.send(bundle);
        } catch (error) {
            this.logger.error('Error fetching policy bundle', { error });
            next(error);
        }
    }
}
