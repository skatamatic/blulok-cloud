import { DatabaseService } from '../services/database.service';
import { ModelHooksService } from '../services/model-hooks.service';
import { v4 as uuidv4 } from 'uuid';

export interface Facility {
  id: string;
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  branding_image?: string; // Base64 encoded image
  image_mime_type?: string;
  contact_email?: string;
  contact_phone?: string;
  status: 'active' | 'inactive' | 'maintenance';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFacilityData {
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  branding_image?: string; // Base64 encoded image
  image_mime_type?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  metadata?: Record<string, any>;
}

export interface UpdateFacilityData extends Partial<CreateFacilityData> {}

export interface FacilityFilters {
  search?: string;
  status?: string;
  sortBy?: 'name' | 'created_at' | 'status';
  sortOrder?: 'asc' | 'desc';
  limit?: number | undefined;
  offset?: number | undefined;
}

export class FacilityModel {
  private db = DatabaseService.getInstance();
  private get hooks() {
    return ModelHooksService.getInstance();
  }

  async findAll(filters: FacilityFilters = {}): Promise<{ facilities: Facility[]; total: number }> {
    const knex = this.db.connection;
    let query = knex('facilities').select('*');

    // Apply filters
    if (filters.search) {
      query = query.where(function(this: any) {
        this.where('name', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`)
            .orWhere('address', 'like', `%${filters.search}%`);
      });
    }

    if (filters.status) {
      query = query.where('status', filters.status);
    }

    // Get total count before pagination - separate count query to avoid GROUP BY issues
    const countQuery = knex('facilities');
    
    // Apply same filters to count query
    if (filters.search) {
      countQuery.where(function(this: any) {
        this.where('name', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`)
            .orWhere('address', 'like', `%${filters.search}%`);
      });
    }
    
    if (filters.status) {
      countQuery.where('status', filters.status);
    }
    
    const countResult = await countQuery.count('* as total').first();
    const total = (countResult as any)?.total || 0;

    // Apply sorting
    const sortBy = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'asc';
    query = query.orderBy(sortBy, sortOrder);

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const facilities = await query;
    return { facilities, total: total as number };
  }

  async findById(id: string): Promise<Facility | null> {
    const knex = this.db.connection;
    const facility = await knex('facilities').where('id', id).first();
    return facility || null;
  }

  async findByIds(ids: string[]): Promise<Facility[]> {
    if (ids.length === 0) return [];
    const knex = this.db.connection;
    return await knex('facilities').whereIn('id', ids);
  }

  async create(data: CreateFacilityData): Promise<Facility> {
    const knex = this.db.connection;

    // Generate UUID for the new facility (same pattern as UnitModel)
    const facilityId = uuidv4();

    // Create the facility with the generated ID
    await knex('facilities').insert({
      id: facilityId,
      ...data,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });

    // Fetch and return the created facility
    const facility = await this.findById(facilityId) as Facility;

    // Trigger model change hook
    await this.hooks.onFacilityChange('create', facility.id, facility);

    return facility;
  }

  async update(id: string, data: UpdateFacilityData): Promise<Facility | null> {
    const knex = this.db.connection;
    
    // Filter out undefined and null values to prevent SQL syntax errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null)
    );
    
    await knex('facilities').where('id', id).update({
      ...cleanData,
      updated_at: new Date()
    });
    const facility = await this.findById(id);
    
    // Trigger model change hook
    if (facility) {
      await this.hooks.onFacilityChange('update', facility.id, facility);
    }
    
    return facility;
  }

  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const deleted = await knex('facilities').where('id', id).del();
    
    // Trigger model change hook
    if (deleted > 0) {
      await this.hooks.onFacilityChange('delete', id);
    }
    
    return deleted > 0;
  }

  async getFacilityStats(facilityId: string): Promise<{
    totalUnits: number;
    occupiedUnits: number;
    availableUnits: number;
    devicesOnline: number;
    devicesTotal: number;
  }> {
    const knex = this.db.connection;
    
    // Get unit stats
    const unitStats = await knex('units')
      .where('facility_id', facilityId)
      .select(
        knex.raw('COUNT(*) as total_units'),
        knex.raw('SUM(CASE WHEN status = "occupied" THEN 1 ELSE 0 END) as occupied_units'),
        knex.raw('SUM(CASE WHEN status = "available" THEN 1 ELSE 0 END) as available_units')
      )
      .first();

    // Get device stats (gateway + access control + blulok devices)
    const deviceStats = await knex.raw(`
      SELECT 
        COUNT(*) as devices_total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as devices_online
      FROM (
        SELECT status FROM gateways WHERE facility_id = ?
        UNION ALL
        SELECT acd.status FROM access_control_devices acd 
        JOIN gateways g ON acd.gateway_id = g.id 
        WHERE g.facility_id = ?
        UNION ALL
        SELECT bd.device_status as status FROM blulok_devices bd
        JOIN gateways g ON bd.gateway_id = g.id
        WHERE g.facility_id = ?
      ) all_devices
    `, [facilityId, facilityId, facilityId]);

    return {
      totalUnits: parseInt(unitStats?.total_units || '0'),
      occupiedUnits: parseInt(unitStats?.occupied_units || '0'),
      availableUnits: parseInt(unitStats?.available_units || '0'),
      devicesOnline: parseInt(deviceStats[0][0]?.devices_online || '0'),
      devicesTotal: parseInt(deviceStats[0][0]?.devices_total || '0')
    };
  }
}
