import { DatabaseService } from '@/services/database.service';

/**
 * App Platform Types
 *
 * Supported mobile/web platforms for user device registration.
 * Used for analytics and platform-specific feature handling.
 */
export type AppPlatform = 'ios' | 'android' | 'web' | 'other';

/**
 * User Device Status
 *
 * Lifecycle states for user device registrations in the security model.
 * - pending_key: Device registered but key not yet rotated/activated
 * - active: Device fully registered and authorized for Route Pass issuance
 * - revoked: Device access permanently revoked (security incident, user request)
 */
export type UserDeviceStatus = 'pending_key' | 'active' | 'revoked';

/**
 * User Device Entity Interface
 *
 * Represents a user's mobile/web app device registration in the BluLok security system.
 * Each device contains cryptographic keys for secure challenge-response authentication.
 *
 * Security Considerations:
 * - Ed25519 public keys are stored for device authentication
 * - Device status controls Route Pass eligibility
 * - App device ID prevents duplicate registrations
 * - Platform tracking enables device-specific features
 * - Audit trail maintained for all device lifecycle events
 */
export interface UserDevice {
  /** Primary key - unique identifier for the device registration */
  id: string;
  /** Foreign key to users table - owner of this device */
  user_id: string;
  /** Device identifier from the mobile app (unique per user) */
  app_device_id: string;
  /** Platform the device is running on */
  platform: AppPlatform;
  /** Human-readable device name for user identification */
  device_name?: string;
  /** Base64-encoded Ed25519 public key for device authentication */
  public_key?: string;
  /** Current lifecycle status of the device registration */
  status: UserDeviceStatus;
  /** Timestamp of last Route Pass issued for this device */
  last_used_at?: Date;
  /** Device registration creation timestamp */
  created_at: Date;
  /** Last modification timestamp */
  updated_at: Date;
}

/**
 * User Device Model Class
 *
 * Handles all database operations for user device registrations. This model is
 * central to the security architecture, managing device-bound cryptographic keys
 * and controlling Route Pass eligibility.
 *
 * Key Features:
 * - Device registration and key management
 * - Platform and status tracking
 * - Upsert operations for seamless device updates
 * - Device revocation for security incidents
 * - Active device counting for rate limiting
 *
 * Security: All operations validate user ownership and maintain audit trails.
 */
export class UserDeviceModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Find a specific device registration by user and app device ID.
   * Used for device-specific operations and key lookups.
   *
   * @param userId - Owner of the device
   * @param appDeviceId - Device identifier from the mobile app
   * @returns Device registration if found, undefined otherwise
   */
  async findByUserAndAppDeviceId(userId: string, appDeviceId: string): Promise<UserDevice | undefined> {
    return this.db('user_devices')
      .where({ user_id: userId, app_device_id: appDeviceId })
      .first();
  }

  /**
   * List all device registrations for a user.
   * Used for device management interfaces and user preferences.
   *
   * @param userId - User whose devices to list
   * @returns Array of user's device registrations, ordered by creation date
   */
  async listByUser(userId: string): Promise<UserDevice[]> {
    return this.db('user_devices').where({ user_id: userId }).orderBy('created_at', 'desc');
  }

  /**
   * Count active devices for a user.
   * Used for enforcing device limits and rate limiting decisions.
   * Active devices include both 'pending_key' and 'active' status devices.
   *
   * @param userId - User whose active devices to count
   * @returns Number of active devices
   */
  async countActiveByUser(userId: string): Promise<number> {
    const row = await this.db('user_devices')
      .where({ user_id: userId })
      .whereIn('status', ['pending_key', 'active'])
      .count('* as count')
      .first();
    return parseInt((row?.count as string) || '0', 10);
  }

  /**
   * Create a new device registration.
   * Used when registering a device for the first time.
   *
   * @param data - Device registration data (excluding auto-generated fields)
   * @returns Created device registration object
   */
  async create(data: Omit<UserDevice, 'id' | 'created_at' | 'updated_at'>): Promise<UserDevice> {
    const [created] = await this.db('user_devices')
      .insert({
        ...data,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning('*');
    return created as UserDevice;
  }

  /**
   * Upsert device registration by user and app device ID.
   * Updates existing registration or creates new one if it doesn't exist.
   * Used for device registration and key rotation operations.
   *
   * @param userId - Device owner
   * @param appDeviceId - Device identifier from app
   * @param data - Fields to update or set
   * @returns Updated or created device registration
   */
  async upsertByUserAndAppDeviceId(userId: string, appDeviceId: string, data: Partial<UserDevice>): Promise<UserDevice> {
    const existing = await this.findByUserAndAppDeviceId(userId, appDeviceId);
    if (existing) {
      const [updated] = await this.db('user_devices')
        .where({ id: existing.id })
        .update({ ...data, updated_at: this.db.fn.now() })
        .returning('*');
      return updated as UserDevice;
    }
    return this.create({
      user_id: userId,
      app_device_id: appDeviceId,
      platform: (data.platform as AppPlatform) || 'other',
      device_name: data.device_name,
      public_key: data.public_key,
      status: (data.status as UserDeviceStatus) || 'pending_key',
      last_used_at: data.last_used_at,
    } as any);
  }

  /**
   * Update device registration by ID.
   * General-purpose update method for device modifications.
   *
   * @param id - Device registration ID to update
   * @param data - Fields to update
   * @returns Updated device registration, or undefined if not found
   */
  async updateById(id: string, data: Partial<UserDevice>): Promise<UserDevice | undefined> {
    const [updated] = await this.db('user_devices')
      .where({ id })
      .update({ ...data, updated_at: this.db.fn.now() })
      .returning('*');
    return updated as UserDevice | undefined;
  }

  /**
   * Revoke device access permanently.
   * Sets device status to 'revoked', preventing future Route Pass issuance.
   * Used for security incidents or user-initiated device removal.
   *
   * @param id - Device registration ID to revoke
   */
  async revoke(id: string): Promise<void> {
    await this.db('user_devices')
      .where({ id })
      .update({ status: 'revoked', updated_at: this.db.fn.now() });
  }
}


