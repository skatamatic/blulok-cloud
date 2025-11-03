import { RoutePassIssuanceModel } from '@/models/route-pass-issuance.model';
import { DeviceDenylistEntry } from '@/models/denylist-entry.model';
import { logger } from '@/utils/logger';

/**
 * Denylist Optimization Service
 *
 * Provides helper methods to determine when denylist commands should be skipped
 * because the associated route passes are already expired. This optimization
 * prevents unnecessary network traffic and reduces load on gateways and devices.
 *
 * Key Principles:
 * - DENYLIST_ADD: Only needed if user has an active (non-expired) route pass
 * - DENYLIST_REMOVE: Only needed if the denylist entry hasn't expired yet
 * - Always maintain DB entries for audit trail, even if commands are skipped
 */
export class DenylistOptimizationService {
  private static routePassModel = new RoutePassIssuanceModel();

  /**
   * Check if DENYLIST_ADD command should be skipped for a user.
   *
   * Skip if:
   * - User has never had a route pass issued, OR
   * - User's last route pass is already expired
   *
   * Rationale: Denylist commands are only effective against currently-valid
   * route passes. If a user's pass is already expired, they will need to
   * request a new pass (which won't include access to denied devices), so
   * there's no need to send a denylist command.
   *
   * @param userId - User ID to check
   * @returns True if denylist command should be skipped
   */
  static async shouldSkipDenylistAdd(userId: string): Promise<boolean> {
    try {
      const isExpired = await this.routePassModel.isUserPassExpired(userId);
      
      if (isExpired) {
        logger.debug(`Skipping DENYLIST_ADD for user ${userId}: last route pass is expired or never issued`);
      }

      return isExpired;
    } catch (error) {
      logger.error(`Error checking route pass expiration for user ${userId}:`, error);
      // On error, err on the side of sending the command (fail-safe)
      return false;
    }
  }

  /**
   * Check if DENYLIST_REMOVE command should be skipped for a denylist entry.
   *
   * Skip if:
   * - Entry's expires_at is null (permanent entry) - never skip
   * - Entry's expires_at is in the past (already expired)
   *
   * Rationale: If a denylist entry has already expired, the device has already
   * removed the user from its denylist. Sending a remove command is redundant.
   * However, we still remove the DB entry for cleanup.
   *
   * @param entry - Denylist entry to check
   * @returns True if denylist remove command should be skipped
   */
  static shouldSkipDenylistRemove(entry: DeviceDenylistEntry): boolean {
    // Permanent entries (expires_at = null) should always have remove commands sent
    if (entry.expires_at === null) {
      return false;
    }

    const now = new Date();
    const shouldSkip = entry.expires_at < now;

    if (shouldSkip) {
      logger.debug(`Skipping DENYLIST_REMOVE for user ${entry.user_id} on device ${entry.device_id}: entry already expired`);
    }

    return shouldSkip;
  }
}

