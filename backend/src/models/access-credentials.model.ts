import { DatabaseService } from '../services/database.service';

export interface AccessCredential {
  id: string;
  user_id: string;
  credential_id: string;
  credential_type: 'physical_key' | 'card' | 'mobile_app' | 'keypad_code';
  credential_name?: string;
  description?: string;
  is_active: boolean;
  issued_at: Date;
  expires_at?: Date;
  issued_by?: string;
  access_permissions?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface AccessCredentialWithDetails extends AccessCredential {
  // Joined data
  user_name?: string;
  user_email?: string;
  issued_by_name?: string;
}

export interface CreateAccessCredentialData {
  user_id: string;
  credential_id: string;
  credential_type: 'physical_key' | 'card' | 'mobile_app' | 'keypad_code';
  credential_name?: string;
  description?: string;
  expires_at?: Date;
  issued_by?: string;
  access_permissions?: Record<string, any>;
}

export interface AccessCredentialFilters {
  user_id?: string;
  credential_type?: string;
  is_active?: boolean;
  expires_before?: Date;
  limit?: number;
  offset?: number;
  sort_by?: 'issued_at' | 'expires_at' | 'credential_name';
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
