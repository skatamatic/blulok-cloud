import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import { randomUUID } from 'crypto';

/**
 * Route Pass Issuance Log Entry Interface
 *
 * Represents a logged route pass (JWT) issuance event in the system.
 * Used for auditing, security analysis, and optimization of denylist commands.
 */
export interface RoutePassIssuanceLog {
  id: string;
  user_id: string;
  device_id: string;
  audiences: string[]; // JSON array of lock IDs in format lock:deviceId
  jti: string; // JWT ID for correlation
  issued_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Route Pass Issuance Model
 *
 * Handles all database operations for route pass issuance logging.
 * This model provides:
 * - Audit trail of all route pass issuances
 * - Expiration checking for denylist optimization
 * - User history retrieval for security analysis
 */
export class RoutePassIssuanceModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  private parseAudiences(raw: unknown, entryId?: string): string[] {
    if (Array.isArray(raw)) {
      return raw.filter((audience): audience is string => typeof audience === 'string');
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        return [];
      }
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        logger.warn('Failed to parse audiences JSON string', {
          entryId,
          raw,
          error: (error as Error).message,
        });
        return [];
      }
    }

    if (raw == null) {
      return [];
    }

    try {
      const serialized = JSON.stringify(raw);
      if (!serialized) {
        return [];
      }
      const parsed = JSON.parse(serialized);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.warn('Failed to serialize and parse audiences payload', {
        entryId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Create a new route pass issuance log entry.
   *
   * @param params - Route pass issuance parameters
   * @param params.userId - User ID the pass was issued for
   * @param params.deviceId - Device ID (user_devices.id) the pass was bound to
   * @param params.audiences - Array of lock IDs in format lock:deviceId
   * @param params.jti - JWT ID from the issued JWT
   * @param params.issuedAt - Timestamp when the pass was issued
   * @param params.expiresAt - Timestamp when the pass expires
   * @returns Created log entry
   */
  async create(params: {
    userId: string;
    deviceId: string;
    audiences: string[];
    jti: string;
    issuedAt: Date;
    expiresAt: Date;
  }): Promise<RoutePassIssuanceLog> {
    const id = randomUUID();
    const now = new Date();

    const [entry] = await this.db('route_pass_issuance_log')
      .insert({
        id,
        user_id: params.userId,
        device_id: params.deviceId,
        audiences: JSON.stringify(params.audiences),
        jti: params.jti,
        issued_at: params.issuedAt,
        expires_at: params.expiresAt,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return {
      ...entry,
      audiences: this.parseAudiences(entry.audiences, entry.id),
    };
  }

  /**
   * Get the most recent route pass issuance for a user.
   *
   * @param userId - User ID to query
   * @returns Most recent route pass issuance, or undefined if none exists
   */
  async getLastIssuanceForUser(userId: string): Promise<RoutePassIssuanceLog | undefined> {
    const entry = await this.db('route_pass_issuance_log')
      .where({ user_id: userId })
      .orderBy('issued_at', 'desc')
      .first();

    if (!entry) {
      return undefined;
    }

    return {
      ...entry,
      audiences: this.parseAudiences(entry.audiences, entry.id),
    };
  }

  /**
   * Check if a user's last route pass is expired.
   *
   * @param userId - User ID to check
   * @returns True if the user has no route passes or their last pass is expired
   */
  async isUserPassExpired(userId: string): Promise<boolean> {
    const lastPass = await this.getLastIssuanceForUser(userId);

    if (!lastPass) {
      // No pass ever issued - consider it "expired" (no need for denylist)
      return true;
    }

    const now = new Date();
    return lastPass.expires_at < now;
  }

  /**
   * Get paginated route pass history for a user.
   *
   * @param userId - User ID to query
   * @param filters - Optional filters
   * @param filters.limit - Maximum number of results (default: 50)
   * @param filters.offset - Offset for pagination (default: 0)
   * @param filters.startDate - Filter entries issued after this date
   * @param filters.endDate - Filter entries issued before this date
   * @returns Array of route pass issuance logs
   */
  async getUserHistory(
    userId: string,
    filters?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<RoutePassIssuanceLog[]> {
    let query = this.db('route_pass_issuance_log').where({ user_id: userId });

    if (filters?.startDate) {
      query = query.where('issued_at', '>=', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.where('issued_at', '<=', filters.endDate);
    }

    query = query
      .orderBy('issued_at', 'desc')
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    const entries = await query;

    return entries.map((entry: any) => ({
      ...entry,
      audiences: this.parseAudiences(entry.audiences, entry.id),
    }));
  }

  /**
   * Get total count of route pass issuances for a user (for pagination).
   *
   * @param userId - User ID to query
   * @param filters - Optional filters (same as getUserHistory)
   * @returns Total count
   */
  async getUserHistoryCount(
    userId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<number> {
    let query = this.db('route_pass_issuance_log').where({ user_id: userId });

    if (filters?.startDate) {
      query = query.where('issued_at', '>=', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.where('issued_at', '<=', filters.endDate);
    }

    const result = await query.count('id as count').first();
    
    if (!result) {
      return 0;
    }
    
    const count = typeof result.count === 'number' ? result.count : parseInt(String(result.count), 10);
    return isNaN(count) ? 0 : count;
  }
}

