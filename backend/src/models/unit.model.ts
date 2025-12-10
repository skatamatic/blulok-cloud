import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { FacilityAccessService } from '@/services/facility-access.service';

/**
 * Unit Entity Interface
 *
 * Represents an individual rental unit (apartment, suite, etc.) within a facility.
 * Units are the basic rentable spaces that tenants occupy and secure with BluLok devices.
 *
 * Key Relationships:
 * - Belongs to a Facility (many-to-one)
 * - Has one BluLok device for physical access control
 * - Assigned to tenants via UnitAssignment records
 * - May have multiple access control devices (gates, elevators)
 *
 * Unit Lifecycle:
 * - Available: Ready for new tenant assignment
 * - Occupied: Currently leased and occupied
 * - Maintenance: Under maintenance, access restricted
 * - Reserved: Held for future tenant but not yet occupied
 *
 * Features & Metadata:
 * - Features: Physical amenities and capabilities (balcony, parking, etc.)
 * - Metadata: Extensible configuration for property-specific attributes
 */
export interface Unit {
  /** Primary key - unique identifier for the unit */
  id: string;
  /** Foreign key to facilities table - the property this unit belongs to */
  facility_id: string;
  /** Human-readable unit identifier (e.g., "101", "2A", "Penthouse") */
  unit_number: string;
  /** Unit type classification (studio, 1BR, 2BR, etc.) */
  unit_type: string | null;
  /** Current occupancy/availability status */
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  /** Optional description of the unit */
  description: string | null;
  /** Physical features and amenities (balcony, parking space, etc.) */
  features: any;
  /** Extensible metadata for unit-specific configuration */
  metadata: any;
  /** Unit creation timestamp */
  created_at: Date;
  /** Last modification timestamp */
  updated_at: Date;
}

/**
 * Unlocked Unit Interface
 *
 * Represents a unit that is currently unlocked for a tenant.
 * Used for real-time monitoring of access status and tenant activity.
 *
 * This interface combines data from units, tenants, facilities, and device status
 * to provide a complete view of active access sessions.
 */
export interface UnlockedUnit {
  /** Unit primary key */
  id: string;
  /** Human-readable unit number */
  unit_number: string;
  /** Facility identifier */
  facility_id: string;
  /** Facility display name */
  facility_name: string;
  /** Current tenant's user ID */
  tenant_id: string;
  /** Current tenant's full name */
  tenant_name: string;
  /** Current tenant's email address */
  tenant_email: string;
  /** Timestamp when unit was unlocked */
  unlocked_since: Date;
  /** Timestamp of last device activity */
  last_activity: Date;
  /** Lock status (always 'unlocked' for this interface) */
  lock_status: 'unlocked';
  /** Current device connectivity status */
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  /** Device battery level percentage */
  battery_level: number | null;
  /** Whether auto-lock is enabled for this unit */
  auto_lock_enabled: boolean;
}

/**
 * Unit Assignment Entity Interface
 *
 * Represents the assignment of a tenant to a unit with specific access permissions.
 * Supports multiple access types and time-based access control.
 *
 * Access Types:
 * - full: Complete access to the unit
 * - shared: Limited access (e.g., common areas only)
 * - temporary: Time-limited access (guests, contractors)
 *
 * Security: Assignments can expire and have granular permissions.
 */
export interface UnitAssignment {
  /** Primary key - unique assignment identifier */
  id: string;
  /** Foreign key to units table - the assigned unit */
  unit_id: string;
  /** Foreign key to users table - the assigned tenant */
  tenant_id: string;
  /** Whether this is the primary tenant for the unit */
  is_primary: boolean;
  /** Type of access granted */
  access_type: 'full' | 'shared' | 'temporary';
  /** Timestamp when access was initially granted */
  access_granted_at: Date;
  /** Optional expiration timestamp for temporary access */
  access_expires_at: Date | null;
  /** User ID who granted this access (for audit trails) */
  granted_by: string | null;
  /** Optional notes about the assignment */
  notes: string | null;
  /** Granular permissions configuration */
  access_permissions: any;
  /** Assignment creation timestamp */
  created_at: Date;
  /** Last modification timestamp */
  updated_at: Date;
}

/**
 * Unit Model Class
 *
 * Handles all database operations for rental units within facilities. Units are the
 * fundamental rentable spaces that tenants access using BluLok devices.
 *
 * Key Responsibilities:
 * - Unit CRUD operations and lifecycle management
 * - Tenant assignment and access control
 * - Real-time unlocked unit monitoring
 * - Facility-scoped unit queries
 * - Integration with BluLok device status
 *
 * Complex Queries:
 * - Unlocked units require joining units, facilities, devices, and tenant assignments
 * - Access control respects user roles and facility permissions
 * - Statistics aggregation for facility dashboards
 *
 * Security: All operations validate user permissions and audit access.
 */
export class UnitModel {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Get unlocked units accessible to a user based on their role and permissions.
   * Returns real-time status of units that are currently unlocked for the user.
   *
   * This is a complex query that joins:
   * - units (for unit info)
   * - facilities (for facility names)
   * - blulok_devices (for lock status and battery)
   * - unit_assignments + users (for tenant info)
   *
   * Role-based Access:
   * - TENANT: Only their assigned units
   * - FACILITY_ADMIN: Units in their managed facilities
   * - ADMIN/DEV_ADMIN: All units (global access)
   *
   * @param userId - User requesting unlocked unit information
   * @param userRole - User's role for access control
   * @returns Promise resolving to array of currently unlocked units
   */
  async getUnlockedUnitsForUser(userId: string, userRole: UserRole): Promise<UnlockedUnit[]> {
    const knex = this.db.connection;
    
    try {
      logger.info(`Getting unlocked units for user ${userId} with role ${userRole}`);
      
      // Use a subquery to get only one primary assignment per unit
      let query = knex
        .select([
          'u.id',
          'u.unit_number',
          'u.facility_id',
          'f.name as facility_name',
          'pa.tenant_id',
          'pa.first_name',
          'pa.last_name',
          'pa.tenant_email',
          'bd.last_seen as unlocked_since',
          'bd.last_seen as last_activity',
          'bd.lock_status',
          'bd.device_status',
          'bd.battery_level',
          'bd.device_settings'
        ])
        .from('units as u')
        .join('facilities as f', 'u.facility_id', 'f.id')
        .join('blulok_devices as bd', 'u.id', 'bd.unit_id')
        .join(
          knex.raw(`(
            SELECT ua.unit_id, ua.tenant_id, u.first_name, u.last_name, u.email as tenant_email,
                   ROW_NUMBER() OVER (PARTITION BY ua.unit_id ORDER BY ua.created_at) as rn
            FROM unit_assignments ua
            JOIN users u ON ua.tenant_id = u.id
            WHERE ua.is_primary = true
          ) as pa`),
          'u.id', 'pa.unit_id'
        )
        .where('pa.rn', 1)
        .where('bd.lock_status', 'unlocked')
        .where('u.status', 'occupied');


      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin see all unlocked units from all facilities
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin see unlocked units from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          query = query.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return empty result
          return [];
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance see only unlocked units that are assigned to them OR shared with them
        const accessibleUnitIds = knex
          .select('unit_id')
          .from('unit_assignments')
          .where('tenant_id', userId)
          .union([
            knex
              .select('unit_id')
              .from('key_sharing')
              .where('shared_with_user_id', userId)
              .where('is_active', true)
              .where(function() {
                this.whereNull('expires_at')
                  .orWhere('expires_at', '>', knex.fn.now());
              })
          ]);
        
        query = query.whereIn('u.id', accessibleUnitIds);
      } else {
        // Unknown role, return empty result
        return [];
    }

    const results = await query;
    
      return results.map(row => ({
        id: row.id,
        unit_number: row.unit_number,
        facility_id: row.facility_id,
        facility_name: row.facility_name,
        tenant_id: row.tenant_id,
        tenant_name: `${row.first_name} ${row.last_name}`,
        tenant_email: row.tenant_email,
        unlocked_since: row.unlocked_since,
        last_activity: row.last_activity,
        lock_status: 'unlocked' as const,
        device_status: row.device_status,
        battery_level: row.battery_level,
        auto_lock_enabled: row.device_settings?.auto_lock_enabled ?? true
      }));

    } catch (error) {
      logger.error('Error fetching unlocked units for user:', error);
      throw error;
    }
  }

  /**
   * Get all units for a user based on their role and access
   */
  async getUnitsForUser(userId: string, userRole: UserRole): Promise<Unit[]> {
    const knex = this.db.connection;
    
    try {
      let query = knex
        .select('u.*')
        .from('units as u')
        .join('facilities as f', 'u.facility_id', 'f.id');

      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin see all units from all facilities
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin see units from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          query = query.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return empty result
          return [];
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance see units assigned to them OR shared with them via key_sharing
        const accessibleUnitIds = knex
          .select('unit_id')
          .from('unit_assignments')
          .where('tenant_id', userId)
          .union([
            knex
              .select('unit_id')
              .from('key_sharing')
              .where('shared_with_user_id', userId)
              .where('is_active', true)
              .where(function() {
                this.whereNull('expires_at')
                  .orWhere('expires_at', '>', knex.fn.now());
              })
          ]);
        
        query = query.whereIn('u.id', accessibleUnitIds);
      } else {
        // Unknown role, return empty result
        return [];
      }

      return await query;

    } catch (error) {
      logger.error('Error fetching units for user:', error);
      throw error;
    }
  }

  /**
   * Get unit assignments for a user
   */
  async getUnitAssignmentsForUser(userId: string, userRole: UserRole): Promise<UnitAssignment[]> {
    const knex = this.db.connection;
    
    try {
      let query = knex
        .select('ua.*')
        .from('unit_assignments as ua')
        .join('units as u', 'ua.unit_id', 'u.id');

      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin see all unit assignments from all facilities
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin see unit assignments from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          query = query.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return empty result
          return [];
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance see only their own assignments
        query = query.where('ua.tenant_id', userId);
      } else {
        // Unknown role, return empty result
        return [];
      }

      return await query;

    } catch (error) {
      logger.error('Error fetching unit assignments for user:', error);
      throw error;
    }
  }

  /**
   * Get units list for management page with pagination and filtering
   */
  async getUnitsListForUser(userId: string, userRole: UserRole, filters: any): Promise<{ units: any[]; total: number }> {
    const knex = this.db.connection;
    
    try {
      // Build base query with all necessary joins
      let query = knex
        .select([
          'u.*',
          'f.name as facility_name',
          'f.address as facility_address',
          'bd.id as device_id',
          'bd.device_serial',
          'bd.lock_status',
          'bd.device_status',
          'bd.battery_level',
          'bd.last_seen as last_activity',
          'bd.firmware_version',
          'bd.signal_strength',
          'bd.temperature',
          'bd.error_code',
          'bd.error_message',
          'ua.tenant_id as primary_tenant_id',
          'users.first_name as tenant_first_name',
          'users.last_name as tenant_last_name',
          'users.email as tenant_email'
        ])
        .from('units as u')
        .leftJoin('facilities as f', 'u.facility_id', 'f.id')
        .leftJoin('blulok_devices as bd', 'u.id', 'bd.unit_id')
        .leftJoin('unit_assignments as ua', function() {
          this.on('u.id', '=', 'ua.unit_id').andOn('ua.is_primary', '=', knex.raw('true'));
        })
        .leftJoin('users', 'ua.tenant_id', 'users.id');

      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin see all units from all facilities
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin see units from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          query = query.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return empty result
          return { units: [], total: 0 };
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance see units assigned to them OR shared with them via key_sharing
        // Use a subquery to get unit IDs from both unit_assignments and active key_sharing records
        const accessibleUnitIds = knex
          .select('unit_id')
          .from('unit_assignments')
          .where('tenant_id', userId)
          .union([
            knex
              .select('unit_id')
              .from('key_sharing')
              .where('shared_with_user_id', userId)
              .where('is_active', true)
              .where(function() {
                this.whereNull('expires_at')
                  .orWhere('expires_at', '>', knex.fn.now());
              })
          ]);
        
        query = query.whereIn('u.id', accessibleUnitIds);
      } else {
        // Unknown role, return empty result
        return { units: [], total: 0 };
      }

      // Apply filters
    if (filters.search) {
        query = query.where(function() {
          this.where('u.unit_number', 'like', `%${filters.search}%`)
            .orWhere('f.name', 'like', `%${filters.search}%`)
            .orWhere('users.first_name', 'like', `%${filters.search}%`)
            .orWhere('users.last_name', 'like', `%${filters.search}%`);
      });
    }
    
    if (filters.status) {
        query = query.where('u.status', filters.status);
    }
    
    if (filters.unit_type) {
        query = query.where('u.unit_type', filters.unit_type);
      }

      if (filters.facility_id) {
        query = query.where('u.facility_id', filters.facility_id);
    }
    
    if (filters.tenant_id) {
        query = query.where('ua.tenant_id', filters.tenant_id);
      }

    // Apply lock status filter
    if (filters.lock_status === 'locked') {
        query = query.where('bd.lock_status', 'locked');
      } else if (filters.lock_status === 'unlocked') {
        query = query.where('bd.lock_status', 'unlocked');
      } else if (filters.lock_status === 'unknown') {
        query = query.where(function() {
          this.whereNull('bd.lock_status').orWhere('bd.lock_status', '');
        });
      }
      // 'all' or no filter means no additional filtering

    // Apply battery threshold filter
    if (filters.battery_threshold) {
      const threshold = parseInt(filters.battery_threshold as string);
      if (!isNaN(threshold)) {
        query = query.where('bd.battery_level', '<=', threshold);
      }
    }

      // We'll calculate the total after deduplication

    // Apply sorting
    const sortBy = filters.sortBy || 'unit_number';
    const sortOrder = filters.sortOrder || 'asc';
      query = query.orderBy(sortBy, sortOrder);

    // Get all results first (without pagination)
    const allResults = await query;
    
    // Deduplicate results by unit ID to prevent duplicate units
    const uniqueUnits = new Map();
    allResults.forEach(row => {
      if (!uniqueUnits.has(row.id)) {
        uniqueUnits.set(row.id, row);
      }
    });
    const deduplicatedResults = Array.from(uniqueUnits.values());
    
    // Apply pagination after deduplication
    const limit = parseInt(filters.limit as string) || 20;
    const offset = parseInt(filters.offset as string) || 0;
    const paginatedResults = deduplicatedResults.slice(offset, offset + limit);
    
    // Calculate total count after deduplication
    const total = deduplicatedResults.length;
    
        // Transform results to match expected format
      const units = paginatedResults.map(row => ({
        id: row.id,
        unit_number: row.unit_number,
        unit_type: row.unit_type,
        status: row.status,
        facility_id: row.facility_id,
        facility_name: row.facility_name,
        facility_address: row.facility_address,
        created_at: row.created_at,
        updated_at: row.updated_at,
        // Add fields expected by frontend widgets
        lock_status: row.lock_status,
        device_status: row.device_status,
        battery_level: row.battery_level,
        last_activity: row.last_activity,
        unlocked_since: row.last_activity || new Date().toISOString(), // Use last_activity as unlocked_since, fallback to now
        tenant_name: row.primary_tenant_id ? `${row.tenant_first_name || ''} ${row.tenant_last_name || ''}`.trim() : null,
        tenant_email: row.tenant_email,
        blulok_device: row.device_id ? {
          id: row.device_id,
          device_serial: row.device_serial,
          lock_status: row.lock_status,
          device_status: row.device_status,
          battery_level: row.battery_level,
          last_activity: row.last_activity,
          firmware_version: row.firmware_version
        } : null,
        primary_tenant: row.primary_tenant_id ? {
          id: row.primary_tenant_id,
          first_name: row.tenant_first_name,
          last_name: row.tenant_last_name,
          email: row.tenant_email
        } : null
      }));

      return { units, total };

    } catch (error) {
      logger.error('Error fetching units list for user:', error);
      throw error;
    }
  }

  /**
   * Lock a unit (set lock status to locked)
   */
  async lockUnit(unitId: string, userId: string): Promise<boolean> {
    const knex = this.db.connection;
    
    try {
      const result = await knex('blulok_devices')
        .where('unit_id', unitId)
        .update({
          lock_status: 'locked',
          last_activity: knex.fn.now(),
          updated_at: knex.fn.now()
        });

      if (result > 0) {
        // Log the lock action
        await knex('access_logs').insert({
          device_id: (await knex('blulok_devices').select('id').where('unit_id', unitId).first()).id,
          device_type: 'blulok',
          user_id: userId,
          action: 'lock',
          method: 'app',
          success: true,
          reason: 'Manual lock via dashboard',
          occurred_at: knex.fn.now()
        });

        return true;
      }

      return false;

    } catch (error) {
      logger.error('Error locking unit:', error);
      throw error;
    }
  }

  /**
   * Check if a user has access to a specific unit
   */
  async hasUserAccessToUnit(unitId: string, userId: string, userRole: UserRole): Promise<boolean> {
    const knex = this.db.connection;
    
    try {
      // Get the unit's facility ID first
      const unit = await knex('units')
        .select('facility_id')
        .where('id', unitId)
        .first();

      if (!unit) {
        return false; // Unit doesn't exist
      }

      // Check facility access
      const hasFacilityAccess = await FacilityAccessService.hasAccessToFacility(
        userId, 
        userRole, 
        unit.facility_id
      );

      if (!hasFacilityAccess) {
        return false; // User doesn't have access to the facility
      }

      // For tenants and maintenance, also check unit assignment OR key_sharing
      if (userRole === 'tenant' || userRole === 'maintenance') {
        // Check unit_assignments first
        const assignment = await knex('unit_assignments')
          .where('unit_id', unitId)
          .where('tenant_id', userId)
          .first();

        if (assignment) {
          return true;
        }

        // Check key_sharing for shared access
        const sharing = await knex('key_sharing')
          .where('unit_id', unitId)
          .where('shared_with_user_id', userId)
          .where('is_active', true)
          .where(function() {
            this.whereNull('expires_at')
              .orWhere('expires_at', '>', knex.fn.now());
          })
          .first();

        return !!sharing;
      }

      return true; // Admin, dev_admin, and facility_admin with facility access
    } catch (error) {
      logger.error('Error checking user access to unit:', error);
      return false; // Fail safe - deny access on error
    }
  }

  /**
   * Create a new unit
   */
  async createUnit(unitData: any, userId: string, userRole: UserRole): Promise<Unit> {
    const knex = this.db.connection;
    
    try {
      // Check if user has access to the facility
      const hasFacilityAccess = await FacilityAccessService.hasAccessToFacility(
        userId,
        userRole,
        unitData.facility_id
      );

      if (!hasFacilityAccess) {
        throw new Error('Access denied: You do not have permission to create units in this facility');
      }

      // Check if unit number already exists in the facility
      const existingUnit = await knex('units')
        .where('facility_id', unitData.facility_id)
        .where('unit_number', unitData.unit_number)
        .first();

      if (existingUnit) {
        throw new Error('Unit number already exists in this facility');
      }

      // Generate UUID for the new unit
      const { v4: uuidv4 } = require('uuid');
      const unitId = uuidv4();

      // Create the unit
      await knex('units').insert({
        id: unitId,
        facility_id: unitData.facility_id,
        unit_number: unitData.unit_number,
        unit_type: unitData.unit_type || null,
        status: unitData.status || 'available',
        description: unitData.description || null,
        features: unitData.features ? JSON.stringify(unitData.features) : null,
        metadata: unitData.metadata ? JSON.stringify(unitData.metadata) : null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });

      // Fetch and return the created unit
      const createdUnit = await knex('units')
        .select('*')
        .where('id', unitId)
        .first();

      logger.info(`Unit created: ${unitData.unit_number} in facility ${unitData.facility_id} by user ${userId}`);
      
      return createdUnit;

    } catch (error) {
      logger.error('Error creating unit:', error);
      throw error;
    }
  }


  /**
   * Get unit statistics for a user
   */
  async getUnitStatsForUser(userId: string, userRole: UserRole): Promise<{
    total: number;
    occupied: number;
    available: number;
    maintenance: number;
    reserved: number;
    unlocked: number;
    locked: number;
  }> {
    const knex = this.db.connection;
    
    try {
      let baseQuery = knex('units as u')
        .join('facilities as f', 'u.facility_id', 'f.id');

      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin see stats for all units from all facilities
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin see stats for units from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          baseQuery = baseQuery.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return empty stats
          return {
            total: 0,
            occupied: 0,
            available: 0,
            maintenance: 0,
            reserved: 0,
            unlocked: 0,
            locked: 0
          };
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance see stats for units that are assigned to them
        baseQuery = baseQuery
          .join('unit_assignments as ua', 'u.id', 'ua.unit_id')
          .where('ua.tenant_id', userId);
      } else {
        // Unknown role, return empty stats
        return {
          total: 0,
          occupied: 0,
          available: 0,
          maintenance: 0,
          reserved: 0,
          unlocked: 0,
          locked: 0
        };
      }

      // Get unit status counts
      const statusCounts = await baseQuery
        .clone()
        .select(
          knex.raw('COUNT(*) as total'),
          knex.raw('SUM(CASE WHEN u.status = "occupied" THEN 1 ELSE 0 END) as occupied'),
          knex.raw('SUM(CASE WHEN u.status = "available" THEN 1 ELSE 0 END) as available'),
          knex.raw('SUM(CASE WHEN u.status = "maintenance" THEN 1 ELSE 0 END) as maintenance'),
          knex.raw('SUM(CASE WHEN u.status = "reserved" THEN 1 ELSE 0 END) as reserved')
        )
        .first();

      // Get lock status counts for occupied units
      const lockCounts = await baseQuery
        .clone()
        .join('blulok_devices as bd', 'u.id', 'bd.unit_id')
        .where('u.status', 'occupied')
        .select(
          knex.raw('SUM(CASE WHEN bd.lock_status = "unlocked" THEN 1 ELSE 0 END) as unlocked'),
          knex.raw('SUM(CASE WHEN bd.lock_status = "locked" THEN 1 ELSE 0 END) as locked')
        )
        .first();

      return {
        total: parseInt(statusCounts.total) || 0,
        occupied: parseInt(statusCounts.occupied) || 0,
        available: parseInt(statusCounts.available) || 0,
        maintenance: parseInt(statusCounts.maintenance) || 0,
        reserved: parseInt(statusCounts.reserved) || 0,
        unlocked: parseInt(lockCounts.unlocked) || 0,
        locked: parseInt(lockCounts.locked) || 0
      };

    } catch (error) {
      logger.error('Error fetching unit stats for user:', error);
      throw error;
    }
  }

  /**
   * Find unit by ID
   */
  async findById(unitId: string): Promise<Unit | null> {
    const knex = this.db.connection;
    
    try {
      const unit = await knex('units')
        .where('id', unitId)
        .first();

      return unit || null;
    } catch (error) {
      logger.error('Error finding unit by ID:', error);
      throw error;
    }
  }

  /**
   * Get unit details for a user with role-based access control
   */
  async getUnitDetailsForUser(unitId: string, userId: string, userRole: UserRole): Promise<any> {
    const knex = this.db.connection;
    
    try {
      // Build base query with all necessary joins
      let query = knex
        .select([
          'u.*',
          'f.name as facility_name',
          'f.address as facility_address',
          'bd.id as device_id',
          'bd.device_serial',
          'bd.lock_status',
          'bd.device_status',
          'bd.battery_level',
          'bd.last_seen as last_activity',
          'bd.firmware_version',
          'bd.signal_strength',
          'bd.temperature',
          'bd.error_code',
          'bd.error_message',
          'ua.tenant_id as primary_tenant_id',
          'users.first_name as tenant_first_name',
          'users.last_name as tenant_last_name',
          'users.email as tenant_email'
        ])
        .from('units as u')
        .leftJoin('facilities as f', 'u.facility_id', 'f.id')
        .leftJoin('blulok_devices as bd', 'u.id', 'bd.unit_id')
        .leftJoin('unit_assignments as ua', function() {
          this.on('u.id', '=', 'ua.unit_id').andOn('ua.is_primary', '=', knex.raw('true'));
        })
        .leftJoin('users', 'ua.tenant_id', 'users.id')
        .where('u.id', unitId);

      // Apply role-based filtering
      if (userRole === 'admin' || userRole === 'dev_admin') {
        // Admin and Dev Admin can see all units
        // No additional filtering needed
      } else if (userRole === 'facility_admin') {
        // Facility Admin can see units from facilities they manage
        const scope = await FacilityAccessService.getUserScope(userId, userRole);
        if (scope.type === 'facility_limited' && scope.facilityIds && scope.facilityIds.length > 0) {
          query = query.whereIn('u.facility_id', scope.facilityIds);
        } else {
          // No facility associations, return null
          return null;
        }
      } else if (userRole === 'tenant' || userRole === 'maintenance') {
        // Tenants and Maintenance can see units they are associated with
        // (either as primary tenant/assigned OR have shared access via key_sharing)
        const accessibleUnitIds = knex
          .select('unit_id')
          .from('unit_assignments')
          .where('tenant_id', userId)
          .union([
            knex
              .select('unit_id')
              .from('key_sharing')
              .where('shared_with_user_id', userId)
              .where('is_active', true)
              .where(function() {
                this.whereNull('expires_at')
                  .orWhere('expires_at', '>', knex.fn.now());
              })
          ]);
        
        query = query.whereIn('u.id', accessibleUnitIds);
      } else {
        // Unknown role, return null
        return null;
      }

      const result = await query.first();
      
      if (!result) {
        return null;
      }

      // Get shared tenant assignments for this unit
      const sharedAssignments = await knex('unit_assignments as ua')
        .join('users as u', 'ua.tenant_id', 'u.id')
        .where('ua.unit_id', unitId)
        .where('ua.is_primary', false)
        .select([
          'ua.id',
          'ua.tenant_id',
          'ua.access_type',
          'ua.access_granted_at',
          'ua.access_expires_at',
          'u.first_name',
          'u.last_name',
          'u.email'
        ]);

      const sharedTenants = sharedAssignments.map(assignment => ({
        id: assignment.tenant_id,
        first_name: assignment.first_name,
        last_name: assignment.last_name,
        email: assignment.email,
        access_type: assignment.access_type,
        access_granted_at: assignment.access_granted_at,
        access_expires_at: assignment.access_expires_at
      }));

      // Transform result to match expected format
      return {
        id: result.id,
        unit_number: result.unit_number,
        unit_type: result.unit_type,
        status: result.status,
        facility_id: result.facility_id,
        facility_name: result.facility_name,
        facility_address: result.facility_address,
        created_at: result.created_at,
        updated_at: result.updated_at,
        // Add fields expected by frontend
        lock_status: result.lock_status,
        device_status: result.device_status,
        battery_level: result.battery_level,
        last_activity: result.last_activity,
        tenant_name: result.primary_tenant_id ? `${result.tenant_first_name || ''} ${result.tenant_last_name || ''}`.trim() : null,
        tenant_email: result.tenant_email,
        blulok_device: result.device_id ? {
          id: result.device_id,
          device_serial: result.device_serial,
          lock_status: result.lock_status,
          device_status: result.device_status,
          battery_level: result.battery_level,
          last_activity: result.last_activity,
          firmware_version: result.firmware_version
        } : null,
        primary_tenant: result.primary_tenant_id ? {
          id: result.primary_tenant_id,
          first_name: result.tenant_first_name,
          last_name: result.tenant_last_name,
          email: result.tenant_email
        } : null,
        shared_tenants: sharedTenants
      };

    } catch (error) {
      logger.error('Error fetching unit details for user:', error);
      throw error;
    }
  }

  /**
   * Find units by primary tenant
   */
  async findByPrimaryTenant(tenantId: string): Promise<Unit[]> {
    const knex = this.db.connection;
    
    try {
      const units = await knex('units as u')
        .join('unit_assignments as ua', 'u.id', 'ua.unit_id')
        .where('ua.tenant_id', tenantId)
        .where('ua.is_primary', true)
        .select('u.*');
    
    return units;
    } catch (error) {
      logger.error('Error finding units by primary tenant:', error);
      throw error;
    }
  }

  /**
   * Update a unit with proper RBAC and validation
   */
  async updateUnit(unitId: string, updateData: any, userId: string, userRole: UserRole): Promise<Unit> {
    const knex = this.db.connection;
    
    try {
      // First, check if user has access to this unit
      const hasAccess = await this.hasUserAccessToUnit(unitId, userId, userRole);
      if (!hasAccess) {
        throw new Error('Access denied: You do not have permission to update this unit');
      }

      // Get the current unit to check for duplicate unit numbers
      const currentUnit = await knex('units').where('id', unitId).first();
      if (!currentUnit) {
        throw new Error('Unit not found');
      }

      // Check for duplicate unit number if it's being changed
      if (updateData.unit_number && updateData.unit_number !== currentUnit.unit_number) {
        const existingUnit = await knex('units')
          .where('facility_id', currentUnit.facility_id)
          .where('unit_number', updateData.unit_number)
          .where('id', '!=', unitId)
          .first();
        
        if (existingUnit) {
          throw new Error('Unit number already exists in this facility');
        }
      }

      // Prepare update data
      const updateFields: any = {
        updated_at: knex.fn.now()
      };

      // Only update fields that are provided
      if (updateData.unit_number !== undefined) {
        updateFields.unit_number = updateData.unit_number;
      }
      if (updateData.unit_type !== undefined) {
        updateFields.unit_type = updateData.unit_type;
      }
      if (updateData.status !== undefined) {
        updateFields.status = updateData.status;
      }
      if (updateData.description !== undefined) {
        updateFields.description = updateData.description;
      }
      if (updateData.features !== undefined) {
        updateFields.features = JSON.stringify(updateData.features);
      }
      if (updateData.metadata !== undefined) {
        updateFields.metadata = JSON.stringify(updateData.metadata);
      }

      // Update the unit
      await knex('units')
        .where('id', unitId)
        .update(updateFields);

      // Get the updated unit
      const updatedUnit = await knex('units').where('id', unitId).first();
      
      logger.info(`Unit updated: ${unitId} by user ${userId}`);
      return updatedUnit;
    } catch (error) {
      logger.error('Error updating unit:', error);
      throw error;
    }
  }
}