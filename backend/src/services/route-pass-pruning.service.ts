/**
 * Route Pass Pruning Service
 *
 * Scheduled service that automatically removes expired route pass issuance logs from the database.
 * Prevents unbounded growth of route pass audit data while maintaining a retention period
 * for security analysis and compliance.
 *
 * Prunes:
 * - Expired route pass issuance logs (after retention period)
 *
 * Scheduling:
 * - Runs daily (every 24 hours)
 * - Can be manually triggered via API endpoint
 * - Graceful error handling to prevent cascade failures
 */

import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export class RoutePassPruningService {
  private static instance: RoutePassPruningService;
  private db = DatabaseService.getInstance().connection;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly DAILY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Retention period (how long to keep records after expiration)
  private readonly ROUTE_PASS_RETENTION_DAYS = 7; // Keep expired route passes for 7 days

  private constructor() {}

  public static getInstance(): RoutePassPruningService {
    if (!this.instance) {
      this.instance = new RoutePassPruningService();
    }
    return this.instance;
  }

  /**
   * Start the scheduled pruning job.
   * Runs daily (every 24 hours).
   */
  public start(): void {
    if (this.intervalId) {
      logger.warn('Route pass pruning service is already started');
      return;
    }

    // Run immediately, then schedule daily
    this.prune().catch(err => {
      logger.error('Error in initial route pass prune (non-fatal):', err);
      // Don't throw - allow service to start even if initial prune fails
    });

    // Schedule daily with error handling to prevent crashes
    this.intervalId = setInterval(async () => {
      try {
        logger.info('Starting scheduled route pass pruning');
        await this.prune();
      } catch (err) {
        // Log error but don't let it crash the server
        logger.error('Error in scheduled route pass prune (non-fatal, will retry tomorrow):', err);
      }
    }, this.DAILY_MS);

    logger.info('Route pass pruning service started (daily interval)');
  }

  /**
   * Stop the scheduled pruning job.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Route pass pruning service stopped');
    }
  }

  /**
   * Prune expired route pass issuance logs from the database.
   * Returns summary of what was removed.
   *
   * Table: route_pass_issuance_log
   * Fields: expires_at (timestamp, not null)
   */
  public async prune(): Promise<{
    routePasses: number;
    errors?: { table: string; message: string }[];
  }> {
    logger.info('Starting route pass pruning');

    const results = {
      routePasses: 0,
      errors: [] as { table: string; message: string }[],
    };

    // Prune route pass issuance logs: expired more than retention period ago
    // Table: route_pass_issuance_log
    // Fields: expires_at (timestamp, not null)
    try {
      const cutoff = new Date(Date.now() - this.ROUTE_PASS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      results.routePasses = await this.db('route_pass_issuance_log')
        .where('expires_at', '<=', cutoff)
        .del();
      logger.debug(`Pruned ${results.routePasses} expired route pass issuance logs`);
    } catch (error: any) {
      const errorMsg = `Failed to prune route_pass_issuance_log: ${error?.message || error}`;
      logger.error('Error pruning route pass issuance logs:', error);
      results.errors.push({ table: 'route_pass_issuance_log', message: errorMsg });
    }

    if (results.errors.length > 0) {
      logger.warn(`Route pass pruning completed with ${results.errors.length} error(s): ${results.routePasses} route passes removed`);
    } else {
      logger.info(`Route pass pruning complete: ${results.routePasses} route passes removed`);
    }

    return results;
  }
}

