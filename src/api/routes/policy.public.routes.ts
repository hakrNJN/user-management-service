import { Router } from 'express';
import { container } from '../../container';
import { PolicyController } from '../controllers/policy.controller';

const router = Router();
const policyController = container.resolve(PolicyController);

// GET /policies/bundle - Get all active policies as an OPA bundle
router.get('/bundle', policyController.getPolicyBundle);

export default router;
