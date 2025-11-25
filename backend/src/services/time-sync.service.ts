import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

/**
 * Time Synchronization Service
 *
 * Generates cryptographically signed time synchronization packets for BluLok smart locks.
 * Ensures monotonic timestamp progression to prevent time-based security attacks.
 *
 * Key Security Features:
 * - Monotonic timestamp enforcement (prevents time rollback attacks)
 * - Cryptographic signing with Ed25519 Operations Key
 * - Persistent timestamp tracking across service restarts
 * - Lock-side timestamp validation (rejects older timestamps)
 * - Comprehensive audit logging and error handling
 *
 * Time Security:
 * - Prevents replay attacks using stale timestamps
 * - Maintains time consistency across distributed lock network
 * - Protects against clock manipulation attacks
 * - Enables secure time-based access control decisions
 */
export class TimeSyncService {
  // In-memory cache of last issued timestamp for performance
  private static lastIssuedTs = 0;

  public static async buildSecureTimeSync(ts?: number): Promise<{ timeSyncJwt: string }> {
    const timestamp = ts ?? Math.floor(Date.now() / 1000);
    let effective = Math.max(timestamp, this.lastIssuedTs);
    try {
      const db = DatabaseService.getInstance().connection;
      const settingKey = 'security.last_time_sync_ts';
      const row = await db('system_settings').where({ key: settingKey }).first();
      const persisted = row ? parseInt(row.value, 10) || 0 : 0;
      effective = Math.max(effective, persisted);
      if (row) {
        await db('system_settings').where({ key: settingKey }).update({ value: String(effective), updated_at: db.fn.now() });
      } else {
        await db('system_settings').insert({ key: settingKey, value: String(effective), created_at: db.fn.now(), updated_at: db.fn.now() });
      }
    } catch (error) {
      logger.error('Failed to persist last_time_sync_ts. Proceeding with in-memory monotonicity only.', error as any);
    }
    this.lastIssuedTs = effective;
    const jwt = await Ed25519Service.signTimeSyncJwt(effective);
    return { timeSyncJwt: jwt };
  }
}


