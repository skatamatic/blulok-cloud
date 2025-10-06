import { DatabaseService } from '../services/database.service';

export interface KeySharing {
  id: string;
  unit_id: string;
  primary_tenant_id: string;
  shared_with_user_id: string;
  access_level: 'full' | 'limited' | 'temporary';
  shared_at: Date;
  expires_at?: Date;
  granted_by?: string;
  notes?: string;
  is_active: boolean;
  access_restrictions?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface KeySharingWithDetails extends KeySharing {
  // Joined data
  unit_number?: string;
  facility_name?: string;
  primary_tenant_name?: string;
  primary_tenant_email?: string;
  shared_with_name?: string;
  shared_with_email?: string;
  granted_by_name?: string;
}

export interface CreateKeySharingData {
  unit_id: string;
  primary_tenant_id: string;
  shared_with_user_id: string;
  access_level?: 'full' | 'limited' | 'temporary';
  expires_at?: Date | null;
  granted_by?: string;
  notes?: string;
  access_restrictions?: Record<string, any>;
}

export interface KeySharingFilters {
  unit_id?: string;
  primary_tenant_id?: string;
  shared_with_user_id?: string;
  access_level?: string;
  is_active?: boolean;
  expires_before?: Date;
  limit?: number;
  offset?: number;
  sort_by?: 'shared_at' | 'expires_at' | 'unit_number' | 'shared_with_name';
  sort_order?: 'asc' | 'desc';
}

export class KeySharingModel {
  private db = DatabaseService.getInstance();

  async findAll(filters: KeySharingFilters = {}): Promise<{ sharings: KeySharingWithDetails[]; total: number }> {
    const knex = this.db.connection;
    
    let query = knex('key_sharing')
      .select(
        'key_sharing.*',
        'units.unit_number',
        'facilities.name as facility_name',
        'primary_tenant.first_name as primary_tenant_name',
        'primary_tenant.email as primary_tenant_email',
        'shared_with.first_name as shared_with_name',
        'shared_with.email as shared_with_email',
        'granted_by_user.first_name as granted_by_name'
      )
      .leftJoin('units', 'key_sharing.unit_id', 'units.id')
      .leftJoin('facilities', 'units.facility_id', 'facilities.id')
      .leftJoin('users as primary_tenant', 'key_sharing.primary_tenant_id', 'primary_tenant.id')
      .leftJoin('users as shared_with', 'key_sharing.shared_with_user_id', 'shared_with.id')
      .leftJoin('users as granted_by_user', 'key_sharing.granted_by', 'granted_by_user.id');

    // Apply filters
    if (filters.unit_id) {
      query = query.where('key_sharing.unit_id', filters.unit_id);
    }
    if (filters.primary_tenant_id) {
      query = query.where('key_sharing.primary_tenant_id', filters.primary_tenant_id);
    }
    if (filters.shared_with_user_id) {
      query = query.where('key_sharing.shared_with_user_id', filters.shared_with_user_id);
    }
    if (filters.access_level) {
      query = query.where('key_sharing.access_level', filters.access_level);
    }
    if (filters.is_active !== undefined) {
      query = query.where('key_sharing.is_active', filters.is_active);
    }
    if (filters.expires_before) {
      query = query.where('key_sharing.expires_at', '<=', filters.expires_before);
    }

    // Get total count
    const countQuery = knex('key_sharing');
    
    // Apply same filters to count query
    if (filters.unit_id) {
      countQuery.where('unit_id', filters.unit_id);
    }
    if (filters.primary_tenant_id) {
      countQuery.where('primary_tenant_id', filters.primary_tenant_id);
    }
    if (filters.shared_with_user_id) {
      countQuery.where('shared_with_user_id', filters.shared_with_user_id);
    }
    if (filters.access_level) {
      countQuery.where('access_level', filters.access_level);
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
    const sortBy = filters.sort_by || 'shared_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.orderBy(`key_sharing.${sortBy}`, sortOrder);

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const sharings = await query;
    return { sharings: sharings as KeySharingWithDetails[], total: total as number };
  }

  async findById(id: string): Promise<KeySharingWithDetails | null> {
    const knex = this.db.connection;
    const sharing = await knex('key_sharing')
      .select(
        'key_sharing.*',
        'units.unit_number',
        'facilities.name as facility_name',
        'primary_tenant.first_name as primary_tenant_name',
        'primary_tenant.email as primary_tenant_email',
        'shared_with.first_name as shared_with_name',
        'shared_with.email as shared_with_email',
        'granted_by_user.first_name as granted_by_name'
      )
      .leftJoin('units', 'key_sharing.unit_id', 'units.id')
      .leftJoin('facilities', 'units.facility_id', 'facilities.id')
      .leftJoin('users as primary_tenant', 'key_sharing.primary_tenant_id', 'primary_tenant.id')
      .leftJoin('users as shared_with', 'key_sharing.shared_with_user_id', 'shared_with.id')
      .leftJoin('users as granted_by_user', 'key_sharing.granted_by', 'granted_by_user.id')
      .where('key_sharing.id', id)
      .first();
    
    return sharing || null;
  }

  async create(data: CreateKeySharingData): Promise<KeySharing> {
    const knex = this.db.connection;
    const [sharing] = await knex('key_sharing').insert(data).returning('*');
    return sharing;
  }

  async update(id: string, data: Partial<KeySharing>): Promise<KeySharing | null> {
    const knex = this.db.connection;
    const [sharing] = await knex('key_sharing')
      .where('id', id)
      .update({ ...data, updated_at: knex.fn.now() })
      .returning('*');
    return sharing || null;
  }

  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const deleted = await knex('key_sharing').where('id', id).del();
    return deleted > 0;
  }

  async revokeSharing(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const updated = await knex('key_sharing')
      .where('id', id)
      .update({ is_active: false, updated_at: knex.fn.now() });
    return updated > 0;
  }

  async getUserSharedKeys(userId: string, filters: Omit<KeySharingFilters, 'shared_with_user_id'> = {}): Promise<{ sharings: KeySharingWithDetails[]; total: number }> {
    return this.findAll({ ...filters, shared_with_user_id: userId });
  }

  async getUserOwnedKeys(userId: string, filters: Omit<KeySharingFilters, 'primary_tenant_id'> = {}): Promise<{ sharings: KeySharingWithDetails[]; total: number }> {
    return this.findAll({ ...filters, primary_tenant_id: userId });
  }

  async getUnitSharedKeys(unitId: string, filters: Omit<KeySharingFilters, 'unit_id'> = {}): Promise<{ sharings: KeySharingWithDetails[]; total: number }> {
    return this.findAll({ ...filters, unit_id: unitId });
  }

  async checkUserHasAccess(userId: string, unitId: string): Promise<boolean> {
    const knex = this.db.connection;
    
    // Check if user is primary tenant
    const primaryTenantCheck = await knex('unit_assignments')
      .where('unit_id', unitId)
      .where('tenant_id', userId)
      .where('is_primary', true)
      .first();
    
    if (primaryTenantCheck) {
      return true;
    }
    
    // Check if user has shared access
    const sharedAccessCheck = await knex('key_sharing')
      .where('unit_id', unitId)
      .where('shared_with_user_id', userId)
      .where('is_active', true)
      .where(function(this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
      })
      .first();
    
    return !!sharedAccessCheck;
  }

  async getExpiredSharings(): Promise<KeySharingWithDetails[]> {
    const knex = this.db.connection;
    const sharings = await knex('key_sharing')
      .select(
        'key_sharing.*',
        'units.unit_number',
        'facilities.name as facility_name',
        'primary_tenant.first_name as primary_tenant_name',
        'primary_tenant.email as primary_tenant_email',
        'shared_with.first_name as shared_with_name',
        'shared_with.email as shared_with_email'
      )
      .leftJoin('units', 'key_sharing.unit_id', 'units.id')
      .leftJoin('facilities', 'units.facility_id', 'facilities.id')
      .leftJoin('users as primary_tenant', 'key_sharing.primary_tenant_id', 'primary_tenant.id')
      .leftJoin('users as shared_with', 'key_sharing.shared_with_user_id', 'shared_with.id')
      .where('key_sharing.is_active', true)
      .where('key_sharing.expires_at', '<=', knex.fn.now());
    
    return sharings as KeySharingWithDetails[];
  }

  async getUserSharedUnits(userId: string): Promise<KeySharing[]> {
    const knex = this.db.connection;
    
    const sharings = await knex('key_sharing')
      .select('*')
      .where('shared_with_user_id', userId)
      .where('is_active', true)
      .where(function(this: any) {
        this.whereNull('expires_at')
            .orWhere('expires_at', '>', knex.fn.now());
      });
    
    return sharings;
  }
}
