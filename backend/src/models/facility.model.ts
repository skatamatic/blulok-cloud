import { DatabaseService } from '../services/database.service';
import { ModelHooksService } from '../services/model-hooks.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Facility Entity Interface
 *
 * Represents a physical property or building in the BluLok system.
 * Facilities are the top-level organizational units that contain storage units,
 * gateways (network bridges), and devices (locks, access controls).
 *
 * Key Relationships:
 * - One-to-Many: Facilities contain multiple units
 * - One-to-Many: Facilities have multiple gateways for device connectivity
 * - One-to-Many: Facilities serve multiple tenants (users)
 * - Many-to-Many: Facilities are managed by facility administrators
 *
 * Facility Lifecycle:
 * - Created when a new property is onboarded
 * - Active during normal operation
 * - Maintenance during upgrades/configuration changes
 * - Inactive when temporarily offline or decommissioned
 *
 * Branding & Contact:
 * - Facilities can have custom branding images for tenant portals
 * - Contact information for property management and support
 * - Geographical coordinates for mapping and location services
 */
export interface Facility {
  /** Primary key - unique identifier for the facility */
  id: string;
  /** Display name of the facility (e.g., "Sunset Apartments") */
  name: string;
  /** Optional description of the facility */
  description?: string;
  /** Physical address of the facility */
  address: string;
  /** Latitude coordinate for mapping and location services */
  latitude?: number;
  /** Longitude coordinate for mapping and location services */
  longitude?: number;
  /** Base64-encoded branding image for tenant portals */
  branding_image?: string;
  /** MIME type of the branding image (e.g., "image/jpeg") */
  image_mime_type?: string;
  /** Contact email for property management */
  contact_email?: string;
  /** Contact phone number for property management */
  contact_phone?: string;
  /** Operational status of the facility */
  status: 'active' | 'inactive' | 'maintenance';
  /** Extensible metadata for facility-specific configuration */
  metadata?: Record<string, any>;
  /** Record creation timestamp */
  created_at: Date;
  /** Last modification timestamp */
  updated_at: Date;
}

/**
 * Facility Creation Data Interface
 *
 * Data required to create a new facility in the system.
 * Used when onboarding new properties to the BluLok platform.
 */
export interface CreateFacilityData {
  /** Display name for the new facility */
  name: string;
  /** Optional description of the facility */
  description?: string;
  /** Physical address of the facility */
  address: string;
  /** Latitude coordinate for the facility location */
  latitude?: number;
  /** Longitude coordinate for the facility location */
  longitude?: number;
  /** Base64-encoded branding image */
  branding_image?: string;
  /** MIME type of the branding image */
  image_mime_type?: string;
  /** Contact email for property management */
  contact_email?: string;
  /** Contact phone number for property management */
  contact_phone?: string;
  /** Initial operational status (defaults to 'active') */
  status?: 'active' | 'inactive' | 'maintenance';
  /** Initial metadata configuration */
  metadata?: Record<string, any>;
}

/**
 * Facility Update Data Interface
 *
 * Fields that can be modified on existing facilities.
 * All fields are optional since updates can be partial.
 */
export interface UpdateFacilityData extends Partial<CreateFacilityData> {}

/**
 * Facility Query Filters Interface
 *
 * Filtering, sorting, and pagination options for facility queries.
 * Used by facility management interfaces and APIs.
 */
export interface FacilityFilters {
  /** Search term to match against name, description, or address */
  search?: string;
  /** Filter by operational status */
  status?: string;
  /** Sort field - defaults to 'name' */
  sortBy?: 'name' | 'created_at' | 'status';
  /** Sort direction - defaults to 'asc' */
  sortOrder?: 'asc' | 'desc';
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
}

/**
 * Facility Model Class
 *
 * Handles all database operations for facility management. Facilities are the
 * cornerstone of the BluLok system, representing physical properties that contain
 * units, gateways, and devices.
 *
 * Key Responsibilities:
 * - Facility CRUD operations for property management
 * - Advanced querying with filtering, sorting, and pagination
 * - Facility statistics aggregation (units, devices, connectivity)
 * - Event-driven updates via model hooks
 * - Multi-tenant facility administration
 *
 * Performance Considerations:
 * - Uses separate count queries to avoid pagination overhead
 * - Complex stats queries are optimized for dashboard performance
 * - Bulk operations supported for facility administration
 *
 * Security: All operations respect facility-scoped access control.
 */
export class FacilityModel {
  private db = DatabaseService.getInstance();

  /**
   * Get reference to model hooks service for event-driven operations.
   * Used for triggering facility-related events and cache invalidation.
   */
  private get hooks() {
    return ModelHooksService.getInstance();
  }

  /**
   * Find facilities with advanced filtering, sorting, and pagination.
   * Core method for facility management interfaces and APIs.
   *
   * Supports:
   * - Text search across name, description, and address
   * - Status filtering (active, inactive, maintenance)
   * - Sorting by name, creation date, or status
   * - Pagination for large result sets
   *
   * @param filters - Query filters, sorting, and pagination options
   * @returns Promise resolving to facilities array and total count
   */
  async findAll(filters: FacilityFilters = {}): Promise<{ facilities: Facility[]; total: number }> {
    const knex = this.db.connection;
    let query = knex('facilities').select('*');

    // Apply text search filter across multiple fields
    if (filters.search) {
      query = query.where(function(this: any) {
        this.where('name', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`)
            .orWhere('address', 'like', `%${filters.search}%`);
      });
    }

    // Apply status filter
    if (filters.status) {
      query = query.where('status', filters.status);
    }

    // Separate count query to avoid GROUP BY overhead with pagination
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

    // Apply sorting (default: name ascending)
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

  /**
   * Find a single facility by its unique identifier.
   * Basic lookup operation used throughout the application.
   *
   * @param id - Facility UUID to retrieve
   * @returns Promise resolving to facility object or null if not found
   */
  async findById(id: string): Promise<Facility | null> {
    const knex = this.db.connection;
    const facility = await knex('facilities').where('id', id).first();
    return facility || null;
  }

  /**
   * Find multiple facilities by their IDs.
   * Bulk operation for efficient batch retrieval.
   *
   * @param ids - Array of facility UUIDs to retrieve
   * @returns Promise resolving to array of found facilities
   */
  async findByIds(ids: string[]): Promise<Facility[]> {
    if (ids.length === 0) return [];
    const knex = this.db.connection;
    return await knex('facilities').whereIn('id', ids);
  }

  /**
   * Create a new facility in the system.
   * Used when onboarding new properties to the BluLok platform.
   *
   * Generates a UUID for the facility and triggers creation hooks
   * for cache invalidation and event-driven updates.
   *
   * @param data - Facility creation data
   * @returns Promise resolving to the created facility object
   */
  async create(data: CreateFacilityData): Promise<Facility> {
    const knex = this.db.connection;

    // Generate UUID for the new facility (consistent with UnitModel pattern)
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

    // Initialize default schedules for the new facility
    try {
      const { SchedulesService } = await import('@/services/schedules.service');
      await SchedulesService.initializeDefaultSchedules(facilityId);
    } catch (error) {
      // Log but don't fail facility creation if schedule initialization fails
      const { logger } = await import('@/utils/logger');
      logger.error(`Failed to initialize default schedules for facility ${facilityId}:`, error);
    }

    // Trigger model change hook for event-driven operations
    await this.hooks.onFacilityChange('create', facility.id, facility);

    return facility;
  }

  /**
   * Update an existing facility.
   * Supports partial updates and triggers change hooks.
   *
   * @param id - Facility UUID to update
   * @param data - Partial facility data to update
   * @returns Promise resolving to updated facility or null if not found
   */
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

    // Trigger model change hook for event-driven operations
    if (facility) {
      await this.hooks.onFacilityChange('update', facility.id, facility);
    }

    return facility;
  }

  /**
   * Delete a facility from the system.
   * Permanently removes the facility and triggers deletion hooks.
   *
   * Security: This operation should cascade appropriately and audit all deletions.
   *
   * @param id - Facility UUID to delete
   * @returns Promise resolving to true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const deleted = await knex('facilities').where('id', id).del();

    // Trigger model change hook for event-driven operations
    if (deleted > 0) {
      await this.hooks.onFacilityChange('delete', id);
    }

    return deleted > 0;
  }

  /**
   * Get comprehensive statistics for a facility.
   * Aggregates data from units, gateways, and devices for dashboard displays.
   *
   * Calculates:
   * - Unit counts (total, occupied, available)
   * - Device connectivity (online/total across all device types)
   *
   * Performance: Uses optimized SQL queries with UNION for device aggregation.
   *
   * @param facilityId - Facility UUID to get statistics for
   * @returns Promise resolving to facility statistics object
   */
  async getFacilityStats(facilityId: string): Promise<{
    totalUnits: number;
    occupiedUnits: number;
    availableUnits: number;
    devicesOnline: number;
    devicesTotal: number;
  }> {
    const knex = this.db.connection;

    // Get unit occupancy statistics
    const unitStats = await knex('units')
      .where('facility_id', facilityId)
      .select(
        knex.raw('COUNT(*) as total_units'),
        knex.raw('SUM(CASE WHEN status = "occupied" THEN 1 ELSE 0 END) as occupied_units'),
        knex.raw('SUM(CASE WHEN status = "available" THEN 1 ELSE 0 END) as available_units')
      )
      .first();

    // Get device connectivity statistics across all physical lock endpoints
    // (access control devices + BluLok devices). Gateways themselves are not
    // counted as "devices" for this metric so that counts align with the
    // number of controllable locks the user sees.
    const deviceStats = await knex.raw(`
      SELECT
        COUNT(*) as devices_total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as devices_online
      FROM (
        SELECT acd.status FROM access_control_devices acd
        JOIN gateways g ON acd.gateway_id = g.id
        WHERE g.facility_id = ?
        UNION ALL
        SELECT bd.device_status as status FROM blulok_devices bd
        JOIN gateways g ON bd.gateway_id = g.id
        WHERE g.facility_id = ?
      ) all_devices
    `, [facilityId, facilityId]);

    return {
      totalUnits: parseInt(unitStats?.total_units || '0'),
      occupiedUnits: parseInt(unitStats?.occupied_units || '0'),
      availableUnits: parseInt(unitStats?.available_units || '0'),
      devicesOnline: parseInt(deviceStats[0][0]?.devices_online || '0'),
      devicesTotal: parseInt(deviceStats[0][0]?.devices_total || '0')
    };
  }
}
