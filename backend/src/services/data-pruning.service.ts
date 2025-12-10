/**
 * Data Pruning Service
 *
 * Scheduled service that automatically removes expired and consumed records from the database.
 * Prevents unbounded growth of temporary authentication and invitation data.
 *
 * Prunes:
 * - Expired/consumed user invites
 * - Expired OTPs (with max attempts exceeded)
 * - Expired/used password reset tokens
 *
 * Scheduling:
 * - Runs daily (every 24 hours)
 * - Can be manually triggered via API endpoint
 * - Graceful error handling to prevent cascade failures
 */

import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export class DataPruningService {
  private static instance: DataPruningService;
  private db = DatabaseService.getInstance().connection;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly DAILY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Retention periods (how long to keep records after expiration/consumption)
  private readonly INVITE_RETENTION_DAYS = 7; // Keep consumed/expired invites for 7 days
  private readonly OTP_RETENTION_DAYS = 1; // Keep expired OTPs for 1 day
  private readonly PASSWORD_RESET_RETENTION_DAYS = 1; // Keep used/expired tokens for 1 day

  private constructor() {}

  public static getInstance(): DataPruningService {
    if (!this.instance) {
      this.instance = new DataPruningService();
    }
    return this.instance;
  }

  /**
   * Start the scheduled pruning job.
   * Runs daily (every 24 hours).
   */
  public start(): void {
    if (this.intervalId) {
      logger.warn('Data pruning service is already started');
      return;
    }

    // Run immediately, then schedule daily
    this.prune().catch(err => {
      logger.error('Error in initial data prune (non-fatal):', err);
      // Don't throw - allow service to start even if initial prune fails
    });

    // Schedule daily with error handling to prevent crashes
    this.intervalId = setInterval(async () => {
      try {
        logger.info('Starting scheduled data pruning');
        await this.prune();
      } catch (err) {
        // Log error but don't let it crash the server
        logger.error('Error in scheduled data prune (non-fatal, will retry tomorrow):', err);
      }
    }, this.DAILY_MS);

    logger.info('Data pruning service started (daily interval)');
  }

  /**
   * Stop the scheduled pruning job.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Data pruning service stopped');
    }
  }

  /**
   * Prune expired and consumed records from the database.
   * Returns summary of what was removed.
   * Each table is pruned independently - failures in one don't stop others.
   */
  public async prune(): Promise<{
    invites: number;
    otps: number;
    passwordResetTokens: number;
    errors?: string[];
  }> {
    logger.info('Starting data pruning');

    const results = {
      invites: 0,
      otps: 0,
      passwordResetTokens: 0,
      errors: [] as string[],
    };

    // Prune user invites: expired or consumed more than retention period ago
    // Table: user_invites
    // Fields: expires_at (timestamp, not null), consumed_at (timestamp, nullable)
    try {
      const inviteCutoff = new Date(Date.now() - this.INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      results.invites = await this.db('user_invites')
        .where(function() {
          this.where('expires_at', '<=', inviteCutoff)
            .orWhere(function() {
              this.whereNotNull('consumed_at')
                .where('consumed_at', '<=', inviteCutoff);
            });
        })
        .del();
      logger.debug(`Pruned ${results.invites} expired/consumed user invites`);
    } catch (error: any) {
      const errorMsg = `Failed to prune user_invites: ${error?.message || error}`;
      logger.error(errorMsg, error);
      results.errors.push(errorMsg);
    }

    // Prune OTPs: expired more than retention period ago
    // Table: user_otps
    // Fields: expires_at (timestamp, not null) - no consumed_at field
    try {
      const otpCutoff = new Date(Date.now() - this.OTP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      results.otps = await this.db('user_otps')
        .where('expires_at', '<=', otpCutoff)
        .del();
      logger.debug(`Pruned ${results.otps} expired OTPs`);
    } catch (error: any) {
      const errorMsg = `Failed to prune user_otps: ${error?.message || error}`;
      logger.error(errorMsg, error);
      results.errors.push(errorMsg);
    }

    // Prune password reset tokens: expired or used more than retention period ago
    // Table: password_reset_tokens
    // Fields: expires_at (timestamp, not null), used_at (timestamp, nullable)
    try {
      const tokenCutoff = new Date(Date.now() - this.PASSWORD_RESET_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      results.passwordResetTokens = await this.db('password_reset_tokens')
        .where(function() {
          this.where('expires_at', '<=', tokenCutoff)
            .orWhere(function() {
              this.whereNotNull('used_at')
                .where('used_at', '<=', tokenCutoff);
            });
        })
        .del();
      logger.debug(`Pruned ${results.passwordResetTokens} expired/used password reset tokens`);
    } catch (error: any) {
      const errorMsg = `Failed to prune password_reset_tokens: ${error?.message || error}`;
      logger.error(errorMsg, error);
      results.errors.push(errorMsg);
    }

    if (results.errors.length > 0) {
      logger.warn(`Data pruning completed with ${results.errors.length} error(s): ${results.invites} invites, ${results.otps} OTPs, ${results.passwordResetTokens} password reset tokens removed`);
    } else {
      logger.info(`Data pruning complete: ${results.invites} invites, ${results.otps} OTPs, ${results.passwordResetTokens} password reset tokens removed`);
    }

    return results;
  }
}

