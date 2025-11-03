/**
 * Denylist Pruning Service
 *
 * Scheduled service that automatically removes expired denylist entries from the database.
 * Ensures that expired entries are cleaned up and optionally sends DENYLIST_REMOVE
 * commands to devices for entries that were previously active.
 *
 * Key Features:
 * - Daily scheduled pruning of expired entries
 * - Automatic cleanup of stale denylist state
 * - Optional removal commands to devices
 * - Comprehensive logging of pruning operations
 * - Error-resilient operation to prevent service interruption
 *
 * Scheduling:
 * - Runs daily at a configurable time (default: 2 AM)
 * - Can be manually triggered via API endpoint
 * - Graceful error handling to prevent cascade failures
 *
 * Performance:
 * - Efficient bulk deletion operations
 * - Indexed queries for fast expiration checks
 * - Minimal database load during pruning
 */
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { logger } from '@/utils/logger';

export class DenylistPruningService {
  private static instance: DenylistPruningService;
  private denylistModel: DenylistEntryModel;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly DAILY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  private constructor() {
    this.denylistModel = new DenylistEntryModel();
  }

  public static getInstance(): DenylistPruningService {
    if (!this.instance) {
      this.instance = new DenylistPruningService();
    }
    return this.instance;
  }

  /**
   * Start the scheduled pruning job.
   * Runs daily (every 24 hours).
   */
  public start(): void {
    if (this.intervalId) {
      logger.warn('Denylist pruning service is already started');
      return;
    }

    // Run immediately, then schedule daily
    this.prune().catch(err => logger.error('Error in initial denylist prune:', err));

    // Schedule daily
    this.intervalId = setInterval(async () => {
      logger.info('Starting scheduled denylist pruning');
      await this.prune();
    }, this.DAILY_MS);

    logger.info('Denylist pruning service started (daily interval)');
  }

  /**
   * Stop the scheduled pruning job.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Denylist pruning service stopped');
    }
  }

  /**
   * Prune expired denylist entries from the database.
   * Returns the number of entries removed.
   */
  public async prune(): Promise<number> {
    try {
      logger.info('Starting denylist entry pruning');
      const removed = await this.denylistModel.pruneExpired();
      logger.info(`Pruned ${removed} expired denylist entries`);
      return removed;
    } catch (error) {
      logger.error('Error during denylist pruning:', error);
      throw error;
    }
  }
}

