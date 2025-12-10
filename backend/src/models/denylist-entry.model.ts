/**
 * Denylist Entry Model
 *
 * Manages device-level denylist entries that track which users are currently
 * denied access to specific devices. This enables:
 * - Tracking denylist state per device
 * - Detecting when previously denied users should be removed from denylist
 * - Managing expiration of temporary denylist entries
 * - Audit trail of denylist operations
 *
 * Key Features:
 * - Device-user pair tracking
 * - Expiration management
 * - Source tracking for audit purposes
 * - Efficient queries for active entries
 * - Automatic cleanup of expired entries
 *
 * Security Considerations:
 * - Entries track which users are denied on which devices
 * - Expiration ensures temporary revocations are cleaned up
 * - Source field enables audit of why users were denied
 * - Foreign key constraints ensure data integrity
 */
import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export type DenylistSource = 'user_deactivation' | 'unit_unassignment' | 'fms_sync' | 'key_sharing_revocation';

export interface DeviceDenylistEntry {
  /** Globally unique identifier for the entry */
  id: string;
  /** Device this entry applies to */
  device_id: string;
  /** User denied access on this device */
  user_id: string;
  /** When this entry expires (NULL for permanent) */
  expires_at: Date | null;
  /** When this entry was created */
  created_at: Date;
  /** When this entry was last updated */
  updated_at: Date;
  /** User/system that created this entry */
  created_by: string | null;
  /** Source of the denylist entry */
  source: DenylistSource;
}

export class DenylistEntryModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new denylist entry
   */
  async create(data: {
    device_id: string;
    user_id: string;
    expires_at?: Date | null;
    source: DenylistSource;
    created_by?: string | null;
  }): Promise<DeviceDenylistEntry> {
    try {
      const id = randomUUID();

      // First, remove any existing entry for this device-user pair
      // (MySQL doesn't support partial unique indexes easily)
      await this.db('device_denylist_entries')
        .where({ device_id: data.device_id, user_id: data.user_id })
        .del();

      const insertData: any = {
        id,
        device_id: data.device_id,
        user_id: data.user_id,
        source: data.source,
        created_by: data.created_by || null,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      };

      if (data.expires_at !== undefined) {
        insertData.expires_at = data.expires_at;
      }

      await this.db('device_denylist_entries').insert(insertData);

      const entry = await this.db('device_denylist_entries')
        .where({ id })
        .first();

      if (!entry) {
        throw new Error('Failed to retrieve created denylist entry');
      }

      return entry;
    } catch (error) {
      logger.error('Error creating denylist entry:', error);
      throw error;
    }
  }

  /**
   * Get all active entries for a device (not expired)
   */
  async findByDevice(deviceId: string): Promise<DeviceDenylistEntry[]> {
    try {
      const now = new Date();
      return await this.db('device_denylist_entries')
        .where({ device_id: deviceId })
        .where((builder: any) => {
          builder.whereNull('expires_at').orWhere('expires_at', '>', now);
        })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error finding device denylist entries:', error);
      throw error;
    }
  }

  /**
   * Get all active entries for a user (not expired)
   */
  async findByUser(userId: string): Promise<DeviceDenylistEntry[]> {
    try {
      const now = new Date();
      return await this.db('device_denylist_entries')
        .where({ user_id: userId })
        .where((builder: any) => {
          builder.whereNull('expires_at').orWhere('expires_at', '>', now);
        })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error finding user denylist entries:', error);
      throw error;
    }
  }

  /**
   * Check if user is denied on device (active entry exists)
   */
  async findByDeviceAndUser(deviceId: string, userId: string): Promise<DeviceDenylistEntry | null> {
    try {
      const now = new Date();
      const entry = await this.db('device_denylist_entries')
        .where({ device_id: deviceId, user_id: userId })
        .where((builder: any) => {
          builder.whereNull('expires_at').orWhere('expires_at', '>', now);
        })
        .first();

      return entry || null;
    } catch (error) {
      logger.error('Error finding denylist entry:', error);
      throw error;
    }
  }

  /**
   * Remove entry for specific device-user pair
   */
  async remove(deviceId: string, userId: string): Promise<boolean> {
    try {
      const deleted = await this.db('device_denylist_entries')
        .where({ device_id: deviceId, user_id: userId })
        .del();

      return deleted > 0;
    } catch (error) {
      logger.error('Error removing denylist entry:', error);
      throw error;
    }
  }

  /**
   * Remove all entries for a device
   */
  async removeByDevice(deviceId: string): Promise<number> {
    try {
      return await this.db('device_denylist_entries')
        .where({ device_id: deviceId })
        .del();
    } catch (error) {
      logger.error('Error removing device denylist entries:', error);
      throw error;
    }
  }

  /**
   * Remove all entries for a user
   */
  async removeByUser(userId: string): Promise<number> {
    try {
      return await this.db('device_denylist_entries')
        .where({ user_id: userId })
        .del();
    } catch (error) {
      logger.error('Error removing user denylist entries:', error);
      throw error;
    }
  }

  /**
   * Remove expired entries
   */
  async pruneExpired(): Promise<number> {
    try {
      const now = new Date();
      return await this.db('device_denylist_entries')
        .whereNotNull('expires_at')
        .where('expires_at', '<=', now)
        .del();
    } catch (error) {
      logger.error('Error pruning expired denylist entries:', error);
      throw error;
    }
  }

  /**
   * Remove entries for devices in specific units for a user
   */
  async removeForUnits(unitIds: string[], userId: string): Promise<number> {
    try {
      // Get device IDs for these units
      const devices = await this.db('blulok_devices')
        .whereIn('unit_id', unitIds)
        .select('id');

      if (devices.length === 0) {
        return 0;
      }

      const deviceIds = devices.map((d: any) => d.id);

      return await this.db('device_denylist_entries')
        .where({ user_id: userId })
        .whereIn('device_id', deviceIds)
        .del();
    } catch (error) {
      logger.error('Error removing denylist entries for units:', error);
      throw error;
    }
  }

  /**
   * Get entries for devices in specific units for a user
   */
  async findByUnitsAndUser(unitIds: string[], userId: string): Promise<DeviceDenylistEntry[]> {
    try {
      // Get device IDs for these units
      const devices = await this.db('blulok_devices')
        .whereIn('unit_id', unitIds)
        .select('id');

      if (devices.length === 0) {
        return [];
      }

      const deviceIds = devices.map((d: any) => d.id);
      const now = new Date();

      return await this.db('device_denylist_entries')
        .where({ user_id: userId })
        .whereIn('device_id', deviceIds)
        .where((builder: any) => {
          builder.whereNull('expires_at').orWhere('expires_at', '>', now);
        });
    } catch (error) {
      logger.error('Error finding denylist entries for units:', error);
      throw error;
    }
  }

  /**
   * Bulk create denylist entries for multiple devices (single INSERT query)
   * More efficient than calling create() in a loop - avoids N+1 writes.
   */
  async bulkCreate(entries: Array<{
    device_id: string;
    user_id: string;
    expires_at?: Date | null;
    source: DenylistSource;
    created_by?: string | null;
  }>): Promise<void> {
    if (entries.length === 0) return;

    try {
      // Get unique device-user pairs to delete existing entries
      const deviceUserPairs = entries.map(e => ({ device_id: e.device_id, user_id: e.user_id }));
      
      // Delete existing entries for these device-user pairs (one query)
      // Build OR conditions for each pair
      await this.db('device_denylist_entries')
        .where((builder: any) => {
          for (const pair of deviceUserPairs) {
            builder.orWhere({ device_id: pair.device_id, user_id: pair.user_id });
          }
        })
        .del();

      // Prepare insert data
      const now = this.db.fn.now();
      const insertData = entries.map(data => ({
        id: randomUUID(),
        device_id: data.device_id,
        user_id: data.user_id,
        source: data.source,
        created_by: data.created_by || null,
        expires_at: data.expires_at !== undefined ? data.expires_at : null,
        created_at: now,
        updated_at: now,
      }));

      // Bulk insert (single query)
      await this.db('device_denylist_entries').insert(insertData);

      logger.debug(`Bulk created ${entries.length} denylist entries`);
    } catch (error) {
      logger.error('Error bulk creating denylist entries:', error);
      throw error;
    }
  }

  /**
   * Bulk remove denylist entries for multiple devices and a user (single DELETE query)
   * More efficient than calling remove() in a loop - avoids N+1 writes.
   */
  async bulkRemove(deviceIds: string[], userId: string): Promise<number> {
    if (deviceIds.length === 0) return 0;

    try {
      const deleted = await this.db('device_denylist_entries')
        .whereIn('device_id', deviceIds)
        .where({ user_id: userId })
        .del();

      logger.debug(`Bulk removed ${deleted} denylist entries for user ${userId}`);
      return deleted;
    } catch (error) {
      logger.error('Error bulk removing denylist entries:', error);
      throw error;
    }
  }
}

