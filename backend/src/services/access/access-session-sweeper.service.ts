/**
 * Periodically marks pending access sessions past expires_at as timed_out.
 */

import { ACCESS_SESSION_SWEEPER_INTERVAL_MS } from '@/constants/access-session.constants';
import { AccessSessionService } from '@/services/access/access-session.service';
import { logger } from '@/utils/logger';

export class AccessSessionSweeperService {
  private static instance: AccessSessionSweeperService;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AccessSessionSweeperService {
    if (!AccessSessionSweeperService.instance) {
      AccessSessionSweeperService.instance = new AccessSessionSweeperService();
    }
    return AccessSessionSweeperService.instance;
  }

  public start(intervalMs: number = ACCESS_SESSION_SWEEPER_INTERVAL_MS): void {
    if (this.intervalId) {
      logger.warn('Access session sweeper already started');
      return;
    }
    this.sweep().catch((err) => {
      logger.error('Error in initial access session sweep (non-fatal):', err);
    });
    this.intervalId = setInterval(() => {
      this.sweep().catch((err) => {
        logger.error('Error in scheduled access session sweep (non-fatal):', err);
      });
    }, intervalMs);
    this.intervalId.unref?.();
    logger.info(`Access session sweeper started (every ${intervalMs}ms)`);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Access session sweeper stopped');
    }
  }

  public async sweep(): Promise<number> {
    const expired = await AccessSessionService.getInstance().expirePendingSessions();
    if (expired.length > 0) {
      logger.info(`Access session sweeper timed out ${expired.length} pending session(s)`);
    }
    return expired.length;
  }

  public static resetForTests(): void {
    if (AccessSessionSweeperService.instance) {
      AccessSessionSweeperService.instance.stop();
    }
    AccessSessionSweeperService.instance = undefined as unknown as AccessSessionSweeperService;
  }
}
