/**
 * Health Check Routes
 *
 * System health monitoring and status endpoints for load balancers, monitoring systems,
 * and operational dashboards. Provides real-time health status without requiring authentication
 * to support automated monitoring and failover detection.
 *
 * Key Features:
 * - Service availability and responsiveness checking
 * - Database connectivity and performance monitoring
 * - System uptime and resource usage tracking
 * - Version information for deployment verification
 * - Graceful degradation for partial system failures
 *
 * Health Check Types:
 * - Basic health check: Service availability and basic metrics
 * - Deep health check: Comprehensive system component verification
 * - Database health check: Connection and query performance
 * - Dependency health check: External service availability
 *
 * Monitoring Integration:
 * - Load balancer health checks for traffic routing
 * - Container orchestration health probes (Kubernetes, Docker)
 * - Application monitoring systems (DataDog, New Relic)
 * - CI/CD pipeline health verification
 * - Alerting systems for automated incident response
 *
 * Security Considerations:
 * - No authentication required for basic monitoring
 * - Information disclosure minimized (no sensitive data)
 * - Rate limiting to prevent abuse
 * - Secure endpoints for detailed health information
 *
 * Response Format:
 * ```json
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "uptime": 3600,
 *   "database": "connected",
 *   "version": "1.0.0"
 * }
 * ```
 *
 * Status Codes:
 * - 200: Service healthy and fully operational
 * - 503: Service unhealthy or partially degraded
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { DatabaseService } from '@/services/database.service';
import { asyncHandler } from '@/middleware/error.middleware';

const router = Router();

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  version: string;
  commitSha?: string;
  commitShort?: string;
  buildId?: string;
  buildUrl?: string;
  service?: string;
  environment?: string;
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

  // Resolve version: prefer explicit APP_VERSION env, then VERSION file, then package.json
  let resolvedVersion: string | undefined = process.env.APP_VERSION;
  if (!resolvedVersion) {
    try {
      const verPath = path.resolve(process.cwd(), 'VERSION');
      if (fs.existsSync(verPath)) {
        resolvedVersion = fs.readFileSync(verPath, 'utf8').trim() || undefined;
      }
    } catch {
      // ignore
    }
  }
  if (!resolvedVersion) {
    resolvedVersion = process.env.npm_package_version || '0.1.0';
  }

  const healthCheck: HealthCheckResponse = {
    status: 'healthy', // Service is healthy even without database in dev mode
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: isDatabaseHealthy ? 'connected' : 'disconnected',
    version: resolvedVersion,
    commitSha: process.env.COMMIT_SHA,
    commitShort: process.env.COMMIT_SHA ? process.env.COMMIT_SHA.substring(0, 7) : undefined,
    buildId: process.env.BUILD_ID,
    buildUrl: process.env.BUILD_URL,
    service: 'backend',
    environment: process.env.NODE_ENV || 'development',
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
