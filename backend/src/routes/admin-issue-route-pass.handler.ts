import { Response } from 'express';
import { AuthenticatedRequest } from '@/types/auth.types';
import { config } from '@/config/environment';
import { RoutePassError, RoutePassOrchestrator } from '@/services/passes/route-pass.orchestrator';
import { logger } from '@/utils/logger';

export type IssueRoutePassDevBody = {
  userId: string;
  appDeviceId?: string;
  facilityId?: string;
};

export async function handleAdminIssueRoutePass(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if ((config.nodeEnv || '').toLowerCase() === 'production') {
    res.status(403).json({
      success: false,
      message: 'Route-pass debug issuance is disabled in production',
    });
    return;
  }

  const value = req.body as IssueRoutePassDevBody;
  const userId = String(value.userId);
  const appDeviceId = value.appDeviceId ? String(value.appDeviceId) : undefined;
  const facilityId = value.facilityId ? String(value.facilityId) : undefined;

  try {
    const routePass = await RoutePassOrchestrator.issueForUser(
      { userId, facilityId },
      appDeviceId,
    );
    logger.info('Dev-tools issued route pass', {
      actorId: req.user?.userId,
      userId,
      appDeviceId: appDeviceId ?? null,
      facilityId: facilityId ?? null,
    });
    res.json({
      success: true,
      routePass,
      userId,
      appDeviceId: appDeviceId ?? null,
      facilityId: facilityId ?? null,
    });
  } catch (err) {
    if (err instanceof RoutePassError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    logger.error('Dev-tools route pass issuance failed', err);
    res.status(500).json({ success: false, message: 'Failed to issue route pass' });
  }
}
