import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { ILogger } from '../../application/interfaces/ILogger';
import { IPolicyAdminService } from '../../application/interfaces/IPolicyAdminService';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError'; // Import NotFoundError specifically
import { AdminUser } from '../../shared/types/admin-user.interface';
// Import DTOs for policies
import { PolicyNotFoundError } from '../../domain/exceptions/UserManagementError'; // Import specific error
import {
    CreatePolicyAdminDto,
    ListPoliciesQueryAdminDto,
    PolicyIdParamsDto,
    UpdatePolicyAdminDto,
    UpdatePolicyAdminParams,
} from '../dtos/policy.admin.dto';

@injectable()
export class PolicyAdminController {
    constructor(
        @inject(TYPES.PolicyAdminService) private policyAdminService: IPolicyAdminService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    private getAdminUser(req: Request): AdminUser {
        if (!req.adminUser) {
            this.logger.error("CRITICAL: Admin user context missing after auth guard in PolicyAdminController.");
            throw new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
        }
        return req.adminUser;
    }

    // POST /admin/policies
    createPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const policyNameFromBody = req.body?.policyName; // For logging context on failure
        try {
            const createDto: CreatePolicyAdminDto = req.body; // Assumes validation middleware ran
            const newPolicy = await this.policyAdminService.createPolicy(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newPolicy);
        } catch (error) {
            this.logger.error(`[PolicyAdminCtrl] Failed to create policy ${policyNameFromBody}`, { adminUserId: adminUser.id, error });
            next(error); // Pass to global error handler
        }
    };

    // GET /admin/policies/:policyId
    getPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const policyIdFromParams = req.params?.policyId; // For logging context
        try {
            // Assuming validation middleware typed params and using PolicyIdParamsDto
            const { policyId }: PolicyIdParamsDto = req.params as any;
            // Use identifier logic if allowing fetch by name:
            // const { identifier }: PolicyIdentifierParamsDto = req.params as any;
            // const policy = await this.policyAdminService.getPolicy(adminUser, identifier);

            const policy = await this.policyAdminService.getPolicy(adminUser, policyId);

            if (!policy) {
                // Use specific NotFoundError for consistency
                throw new PolicyNotFoundError(policyId);
            } else {
                res.status(HttpStatusCode.OK).json(policy);
            }
        } catch (error) {
            // Catch PolicyNotFoundError specifically if needed for different logging,
            // otherwise let the global handler manage it based on status code.
             if (!(error instanceof PolicyNotFoundError)) {
                 this.logger.error(`[PolicyAdminCtrl] Failed to get policy ${policyIdFromParams}`, { adminUserId: adminUser.id, error });
             }
             // Always pass error to next for consistent handling
             next(error);
        }
    };

     // GET /admin/policies
    listPolicies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            // Assume validation middleware typed query params
            const queryDto: ListPoliciesQueryAdminDto = req.query as any;

            // Parse startKey if it's expected to be JSON (depends on repo implementation)
            // Or treat it as an opaque string
            const options = {
                limit: queryDto.limit,
                startKey: queryDto.startKey ? queryDto.startKey as any : undefined, // Let repo handle opaque key
                language: queryDto.language,
            };

            const result = await this.policyAdminService.listPolicies(adminUser, options);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
             this.logger.error(`[PolicyAdminCtrl] Failed to list policies`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

     // PUT /admin/policies/:policyId
    updatePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         const policyIdFromParams = req.params?.policyId; // For logging context
         try {
            // Assuming validation middleware typed params and body
            const { policyId }: UpdatePolicyAdminParams = req.params as any;
            const updateDto: UpdatePolicyAdminDto = req.body;

            const updatedPolicy = await this.policyAdminService.updatePolicy(adminUser, policyId, updateDto);

             // Service layer now throws PolicyNotFoundError if not found
            res.status(HttpStatusCode.OK).json(updatedPolicy);

        } catch (error) {
             if (!(error instanceof PolicyNotFoundError)) {
                this.logger.error(`[PolicyAdminCtrl] Failed to update policy ${policyIdFromParams}`, { adminUserId: adminUser.id, error });
             }
             next(error); // Pass all errors (incl. PolicyNotFoundError) to middleware
        }
    };

      // DELETE /admin/policies/:policyId
     deletePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         const policyIdFromParams = req.params?.policyId; // For logging context
         try {
            // Assuming validation middleware typed params
            const { policyId }: PolicyIdParamsDto = req.params as any;

            await this.policyAdminService.deletePolicy(adminUser, policyId);
            res.status(HttpStatusCode.NO_CONTENT).send();

        } catch (error) {
             if (!(error instanceof PolicyNotFoundError)) {
                 this.logger.error(`[PolicyAdminCtrl] Failed to delete policy ${policyIdFromParams}`, { adminUserId: adminUser.id, error });
             }
             next(error); // Pass all errors (incl. PolicyNotFoundError) to middleware
        }
    };
}