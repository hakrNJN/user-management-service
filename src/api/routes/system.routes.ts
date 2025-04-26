import { Router } from 'express';
import { container } from '../../container';
import { SystemController } from '../controllers/system.controller';

// Resolve controller from container
const systemController = container.resolve(SystemController);

// Create router instance
const router = Router();

// Define System Routes (No admin guard needed for these)
router.get('/health', systemController.getHealth);
router.get('/server-info', systemController.getServerInfo);

export default router;
