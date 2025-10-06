import { Router, Request, Response } from 'express';
import { DatabaseService } from '@/services/database.service';
import { asyncHandler } from '@/middleware/error.middleware';

const router = Router();

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  version: string;
}

router.get('/', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const dbService = DatabaseService.getInstance();
  let isDatabaseHealthy = false;
  
  try {
    isDatabaseHealthy = await dbService.healthCheck();
  } catch (error) {
    // Database connection not available, but service can still be healthy
    isDatabaseHealthy = false;
  }

  const healthCheck: HealthCheckResponse = {
    status: 'healthy', // Service is healthy even without database in dev mode
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: isDatabaseHealthy ? 'connected' : 'disconnected',
    version: process.env.npm_package_version || '1.0.0',
  };

  res.status(200).json(healthCheck);
}));

router.get('/liveness', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

router.get('/readiness', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const dbService = DatabaseService.getInstance();
  const isDatabaseReady = await dbService.healthCheck();

  if (isDatabaseReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      reason: 'Database connection failed',
    });
  }
}));

export { router as healthRouter };
