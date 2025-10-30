import { DatabaseService } from '../services/database.service';

/**
 * Access Credentials Model
 *
 * Manages physical and digital access credentials for users in the BluLok system.
 * Handles credential lifecycle from issuance to expiration and revocation.
 *
 * Key Features:
 * - Multi-type credential support (physical keys, cards, mobile apps, keypads)
 * - Expiration and renewal management
 * - Permission-based access control
 * - Audit trail for credential operations
 * - User association and credential uniqueness
 *
 * Credential Types:
 * - physical_key: Traditional metal keys or key fobs
 * - card: RFID/NFC access cards
 * - mobile_app: Digital credentials in mobile applications
 * - keypad_code: Temporary numeric codes for keypads
 *
 * Security Considerations:
 * - Credential uniqueness validation
 * - Expiration enforcement
 * - Permission validation on access
 * - Audit logging for all operations
 * - Secure credential storage and transmission
 */

/**
 * Access Credential Interface
 *
 * Core representation of an access credential in the system.
 * Contains all metadata and lifecycle information for credential management.
 */
export interface AccessCredential {
  /** Globally unique identifier for the credential */
  id: string;
  /** User ID that owns this credential */
  user_id: string;
  /** Unique credential identifier (key number, card ID, etc.) */
  credential_id: string;
  /** Type classification of the credential */
  credential_type: 'physical_key' | 'card' | 'mobile_app' | 'keypad_code';
  /** Human-readable name for the credential */
  credential_name?: string;
  /** Detailed description or notes about the credential */
  description?: string;
  /** Whether the credential is currently active and usable */
  is_active: boolean;
  /** Timestamp when the credential was issued */
  issued_at: Date;
  /** Optional expiration timestamp for temporary credentials */
  expires_at?: Date;
  /** User ID of the person who issued the credential */
  issued_by?: string;
  /** Permission configuration specific to this credential */
  access_permissions?: Record<string, any>;
  /** Automatic timestamp of record creation */
  created_at: Date;
  /** Automatic timestamp of last record update */
  updated_at: Date;
}

/**
 * Access Credential with Joined User Details
 *
 * Extended credential interface including joined user information for display purposes.
 * Used in admin interfaces and reporting where user context is needed.
 */
export interface AccessCredentialWithDetails extends AccessCredential {
  // Joined user data for display purposes
  /** Full name of the credential owner */
  user_name?: string;
  /** Email address of the credential owner */
  user_email?: string;
  /** Full name of the person who issued the credential */
  issued_by_name?: string;
}

/**
 * Access Credential Creation Data
 *
 * Input interface for creating new access credentials.
 * Contains required fields and optional configuration parameters.
 */
export interface CreateAccessCredentialData {
  /** User ID that will own the new credential */
  user_id: string;
  /** Unique identifier for the new credential */
  credential_id: string;
  /** Type classification for the new credential */
  credential_type: 'physical_key' | 'card' | 'mobile_app' | 'keypad_code';
  /** Optional human-readable name */
  credential_name?: string;
  /** Optional detailed description */
  description?: string;
  /** Optional expiration date for temporary credentials */
  expires_at?: Date;
  /** User ID of the person issuing the credential */
  issued_by?: string;
  /** Permission configuration for the credential */
  access_permissions?: Record<string, any>;
}

/**
 * Access Credential Query Filters
 *
 * Filtering and pagination options for credential queries.
 * Supports advanced filtering and sorting for credential management.
 */
export interface AccessCredentialFilters {
  /** Filter by specific user ownership */
  user_id?: string;
  /** Filter by credential type */
  credential_type?: string;
  /** Filter by active/inactive status */
  is_active?: boolean;
  /** Filter credentials expiring before a specific date */
  expires_before?: Date;
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
  /** Sort field for result ordering */
  sort_by?: 'issued_at' | 'expires_at' | 'credential_name';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

export class AccessCredentialModel {
  private db = DatabaseService.getInstance();

  async findAll(filters: AccessCredentialFilters = {}): Promise<{ credentials: AccessCredentialWithDetails[]; total: number }> {
    const knex = this.db.connection;
    
    let query = knex('access_credentials')
      .select(
        'access_credentials.*',
        'users.first_name as user_name',
        'users.email as user_email',
        'issued_by_user.first_name as issued_by_name'
      )
      .leftJoin('users', 'access_credentials.user_id', 'users.id')
      .leftJoin('users as issued_by_user', 'access_credentials.issued_by', 'issued_by_user.id');

    // Apply filters
    if (filters.user_id) {
      query = query.where('access_credentials.user_id', filters.user_id);
    }
    if (filters.credential_type) {
      query = query.where('access_credentials.credential_type', filters.credential_type);
    }
    if (filters.is_active !== undefined) {
      query = query.where('access_credentials.is_active', filters.is_active);
    }
    if (filters.expires_before) {
      query = query.where('access_credentials.expires_at', '<=', filters.expires_before);
    }

    // Get total count
    const countQuery = knex('access_credentials');
    
    // Apply same filters to count query
    if (filters.user_id) {
      countQuery.where('user_id', filters.user_id);
    }
    if (filters.credential_type) {
      countQuery.where('credential_type', filters.credential_type);
    }
    if (filters.is_active !== undefined) {
      countQuery.where('is_active', filters.is_active);
    }
    if (filters.expires_before) {
      countQuery.where('expires_at', '<=', filters.expires_before);
    }
    
    const countResult = await countQuery.count('* as total').first();
    const total = (countResult as any)?.total || 0;

    // Apply sorting
    const sortBy = filters.sort_by || 'issued_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.orderBy(`access_credentials.${sortBy}`, sortOrder);

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const credentials = await query;
    return { credentials: credentials as AccessCredentialWithDetails[], total: total as number };
  }

  async findById(id: string): Promise<AccessCredentialWithDetails | null> {
    const knex = this.db.connection;
    const credential = await knex('access_credentials')
      .select(
        'access_credentials.*',
        'users.first_name as user_name',
        'users.email as user_email',
        'issued_by_user.first_name as issued_by_name'
      )
      .leftJoin('users', 'access_credentials.user_id', 'users.id')
      .leftJoin('users as issued_by_user', 'access_credentials.issued_by', 'issued_by_user.id')
      .where('access_credentials.id', id)
      .first();
    
    return credential || null;
  }

  async findByCredentialId(credentialId: string, credentialType: string): Promise<AccessCredentialWithDetails | null> {
    const knex = this.db.connection;
    const credential = await knex('access_credentials')
      .select(
        'access_credentials.*',
        'users.first_name as user_name',
        'users.email as user_email',
        'issued_by_user.first_name as issued_by_name'
      )
      .leftJoin('users', 'access_credentials.user_id', 'users.id')
      .leftJoin('users as issued_by_user', 'access_credentials.issued_by', 'issued_by_user.id')
      .where('access_credentials.credential_id', credentialId)
      .where('access_credentials.credential_type', credentialType)
      .where('access_credentials.is_active', true)
      .first();
    
    return credential || null;
  }

  async create(data: CreateAccessCredentialData): Promise<AccessCredential> {
    const knex = this.db.connection;
    const [credential] = await knex('access_credentials').insert(data).returning('*');
    return credential;
  }

  async update(id: string, data: Partial<AccessCredential>): Promise<AccessCredential | null> {
    const knex = this.db.connection;
    const [credential] = await knex('access_credentials')
      .where('id', id)
      .update({ ...data, updated_at: knex.fn.now() })
      .returning('*');
    return credential || null;
  }

  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const deleted = await knex('access_credentials').where('id', id).del();
    return deleted > 0;
  }

  async deactivate(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const updated = await knex('access_credentials')
      .where('id', id)
      .update({ is_active: false, updated_at: knex.fn.now() });
    return updated > 0;
  }

  async getUserCredentials(userId: string, filters: Omit<AccessCredentialFilters, 'user_id'> = {}): Promise<{ credentials: AccessCredentialWithDetails[]; total: number }> {
    return this.findAll({ ...filters, user_id: userId });
  }

  async getExpiredCredentials(): Promise<AccessCredentialWithDetails[]> {
    const knex = this.db.connection;
    const credentials = await knex('access_credentials')
      .select(
        'access_credentials.*',
        'users.first_name as user_name',
        'users.email as user_email'
      )
      .leftJoin('users', 'access_credentials.user_id', 'users.id')
      .where('access_credentials.is_active', true)
      .where('access_credentials.expires_at', '<=', knex.fn.now());
    
    return credentials as AccessCredentialWithDetails[];
  }

  async validateCredential(credentialId: string, credentialType: string): Promise<AccessCredentialWithDetails | null> {
    const knex = this.db.connection;
    const credential = await knex('access_credentials')
      .select(
        'access_credentials.*',
        'users.first_name as user_name',
        'users.email as user_email'
      )
      .leftJoin('users', 'access_credentials.user_id', 'users.id')
      .where('access_credentials.credential_id', credentialId)
      .where('access_credentials.credential_type', credentialType)
      .where('access_credentials.is_active', true)
      .where(function(this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
      })
      .first();
    
    return credential || null;
  }
}
