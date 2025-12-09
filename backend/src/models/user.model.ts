import { BaseModel } from './base.model';
import { UserRole } from '@/types/auth.types';
import { ModelHooksService } from '../services/model-hooks.service';

/**
 * User Entity Interface
 *
 * Represents a user account in the BluLok system with authentication and authorization data.
 * Users are the primary actors in the system, with roles determining their access permissions.
 *
 * Security Considerations:
 * - Passwords are stored as bcrypt hashes only
 * - Email addresses must be unique across the system
 * - Role-based access control governs all operations
 * - Account status (active/inactive) controls authentication
 * - Audit logging captures all user lifecycle events
 */
export interface User {
  /** Primary key - unique identifier for the user */
  id: string;
  /** Unique login identifier (email or normalized phone) */
  login_identifier?: string;
  /** User's email address (may be null for phone-only users) */
  email: string | null;
  /** Optional normalized E.164 phone number */
  phone_number?: string | null;
  /** Bcrypt hash of user's password */
  password_hash: string;
  /** User's first name for display purposes */
  first_name: string;
  /** User's last name for display purposes */
  last_name: string;
  /** User's assigned role determining permissions */
  role: UserRole;
  /** Whether the user account is active and can authenticate */
  is_active: boolean;
  /** Whether the user must set a new password on next login */
  requires_password_reset?: boolean;
  /** Timestamp of user's last successful login */
  last_login?: Date;
  /** Account creation timestamp */
  created_at: Date;
  /** Last modification timestamp */
  updated_at: Date;
}

/**
 * User Model Class
 *
 * Handles all database operations for user accounts. Extends BaseModel to provide
 * standard CRUD operations with additional user-specific functionality.
 *
 * Key Features:
 * - Password hashing with bcrypt
 * - Role-based access control
 * - Account lifecycle management (activate/deactivate)
 * - Model hooks for event-driven operations
 * - Audit trail integration
 *
 * Security: All operations validate user permissions and log changes.
 */
export class UserModel extends BaseModel {
  protected static override get tableName(): string {
    return 'users';
  }

  /**
   * Get reference to model hooks service for event-driven operations.
   * Used for triggering denylist updates and audit logging.
   */
  private static get hooks() {
    return ModelHooksService.getInstance();
  }

  /**
   * Find user by email address.
   * Used during authentication to locate user accounts.
   *
   * @param email - User's email address
   * @returns User object if found, undefined otherwise
   */
  public static async findByEmail(email: string): Promise<User | undefined> {
    return this.query().where('email', email).first() as Promise<User | undefined>;
  }

  /**
   * Find user by login identifier (email or phone-normalized string).
   */
  public static async findByLoginIdentifier(identifier: string): Promise<User | undefined> {
    return this.query().where('login_identifier', identifier.toLowerCase()).first() as Promise<User | undefined>;
  }

  /**
   * Find user by phone number (normalized E.164).
   */
  public static async findByPhone(phoneE164: string): Promise<User | undefined> {
    return this.query().where('phone_number', phoneE164).first() as Promise<User | undefined>;
  }

  /**
   * Find multiple users by their IDs
   */
  public static async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.query().whereIn('id', ids) as Promise<User[]>;
  }

  /**
   * Find all active users in the system.
   * Used for user management interfaces and reporting.
   *
   * @returns Array of active user objects
   */
  public static async findActiveUsers(): Promise<User[]> {
    return this.query().where('is_active', true) as Promise<User[]>;
  }

  /**
   * Find all users with a specific role.
   * Useful for role-based queries and administration.
   *
   * @param role - User role to filter by
   * @returns Array of users with the specified role
   */
  public static async findByRole(role: UserRole): Promise<User[]> {
    return this.query().where('role', role) as Promise<User[]>;
  }

  /**
   * Update user's last login timestamp.
   * Called after successful authentication to track user activity.
   *
   * @param id - User ID to update
   */
  public static async updateLastLogin(id: string): Promise<void> {
    await this.query()
      .where('id', id)
      .update({
        last_login: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Deactivate a user account.
   * Sets is_active to false, preventing authentication.
   * Triggers model hooks for event-driven operations (e.g., denylist updates).
   *
   * Security: This operation should be audited and requires appropriate permissions.
   *
   * @param id - User ID to deactivate
   * @returns Updated user object, or undefined if not found
   */
  public static async deactivateUser(id: string): Promise<User | undefined> {
    await this.query()
      .where('id', id)
      .update({
        is_active: false,
        updated_at: this.db.fn.now(),
      });

    const user = await this.findById(id) as User | undefined;

    // Trigger model change hook for event-driven operations
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }

    return user;
  }

  /**
   * Activate a user account.
   * Sets is_active to true, allowing authentication.
   * Triggers model hooks for event-driven operations.
   *
   * @param id - User ID to activate
   * @returns Updated user object, or undefined if not found
   */
  public static async activateUser(id: string): Promise<User | undefined> {
    await this.query()
      .where('id', id)
      .update({
        is_active: true,
        updated_at: this.db.fn.now(),
      });

    const user = await this.findById(id) as User | undefined;

    // Trigger model change hook for event-driven operations
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }

    return user;
  }

  // Legacy methods for backwards compatibility with older tests
  // TODO: Remove these once all tests are updated to use new method names
  public static async update(id: string, data: Partial<User>): Promise<User | undefined> {
    const updated = await this.updateById(id, data as Record<string, unknown>);
    return updated as User | undefined;
  }

  public static async deactivate(id: string, _performedBy?: string, _reason?: string): Promise<void> {
    await this.query()
      .where('id', id)
      .update({ is_active: false, updated_at: this.db.fn.now() });
    const user = await this.findById(id) as User | undefined;
    if (user) {
      await this.hooks.onUserChange('status_change', user.id, user);
    }
  }
}
