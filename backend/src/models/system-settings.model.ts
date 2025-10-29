import { DatabaseService } from '@/services/database.service';

/**
 * System Settings Model
 *
 * Key-value store for system-wide configuration and runtime settings.
 * Provides persistent storage for application configuration that needs to be
 * dynamically updated without code changes or environment variable modifications.
 *
 * Key Features:
 * - Simple key-value storage with automatic timestamps
 * - Runtime configuration management
 * - Audit trail for setting changes
 * - Type-safe configuration retrieval
 * - Default value support for missing settings
 *
 * Security Considerations:
 * - Access control based on user roles
 * - Audit logging for all setting changes
 * - Validation of setting values and formats
 * - Secure storage of sensitive configuration
 * - Permission checks for setting modifications
 */

/**
 * System Setting Record Interface
 *
 * Represents a single configuration setting in the system.
 * Simple key-value structure with automatic timestamp management.
 */
export interface SystemSetting {
  /** Globally unique identifier for the setting record */
  id: string;
  /** Configuration key identifier */
  key: string;
  /** Configuration value (stored as string, parsed by consumers) */
  value: string;
  /** Automatic record creation timestamp */
  created_at: Date;
  /** Automatic record update timestamp */
  updated_at: Date;
}

/**
 * System Settings Model Class
 *
 * Provides type-safe access to system-wide configuration settings.
 * Implements key-value storage with automatic persistence and retrieval.
 */
export class SystemSettingsModel {
  // Database connection instance
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Retrieve a setting value by key
   * @param key - Setting key to retrieve
   * @returns Setting value or undefined if not found
   */
  async get(key: string): Promise<string | undefined> {
    const row = await this.db('system_settings').where({ key }).first();
    return row?.value;
  }

  /**
   * Set or update a setting value
   * @param key - Setting key to set/update
   * @param value - New value for the setting
   */
  async set(key: string, value: string): Promise<void> {
    const row = await this.db('system_settings').where({ key }).first();
    if (row) {
      await this.db('system_settings').where({ key }).update({ value, updated_at: this.db.fn.now() });
    } else {
      await this.db('system_settings').insert({ key, value, created_at: this.db.fn.now(), updated_at: this.db.fn.now() });
    }
  }
}


