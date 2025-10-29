import { DatabaseService } from '../services/database.service';

/**
 * Access Log Model
 *
 * Comprehensive audit trail for all access control events in the BluLok system.
 * Records every access attempt, success, failure, and system event for security,
 * compliance, and operational monitoring.
 *
 * Key Features:
 * - Complete audit trail of all access events
 * - Multi-device type support (BluLok locks, access control panels)
 * - Geographic tracking and session correlation
 * - Denial reason categorization for security analysis
 * - Performance metrics and system health monitoring
 * - Integration with compliance reporting systems
 *
 * Device Types:
 * - blulok: Smart locks and primary access devices
 * - access_control: Secondary access control panels and readers
 *
 * Action Types:
 * - unlock/lock: Physical access control actions
 * - access_granted/denied: Permission-based access decisions
 * - door/gate operations: Physical device state changes
 * - system events: Errors, timeouts, and system issues
 *
 * Security Considerations:
 * - Immutable audit records with tamper detection
 * - Geographic access pattern analysis
 * - Session correlation for fraud detection
 * - Comprehensive metadata for forensic analysis
 * - Compliance-ready data retention policies
 *
 * Business Intelligence:
 * - Usage pattern analysis for facility optimization
 * - Security incident investigation and response
 * - Performance monitoring and SLA tracking
 * - Predictive maintenance based on failure patterns
 */

/**
 * Access Log Entry Interface
 *
 * Complete representation of an access control event.
 * Captures all contextual information for security auditing and analysis.
 */
export interface AccessLog {
  /** Globally unique identifier for the log entry */
  id: string;
  /** Device that generated or is associated with the event */
  device_id: string;
  /** Classification of the device type */
  device_type: 'blulok' | 'access_control';
  /** Facility where the event occurred */
  facility_id?: string;
  /** Specific unit/storage space involved */
  unit_id?: string;
  /** Associated access control device identifier */
  access_control_device_id?: string;
  /** Gateway that processed the event */
  gateway_id?: string;
  /** User who initiated or is associated with the access */
  user_id?: string;
  /** Primary tenant of the unit/facility */
  primary_tenant_id?: string;
  /** Credential identifier used for access */
  credential_id?: string;
  /** Type of credential used */
  credential_type?: 'physical_key' | 'mobile_app' | 'card' | 'keypad';
  /** Action performed or attempted */
  action: 'unlock' | 'lock' | 'access_granted' | 'access_denied' | 'manual_override' |
          'door_open' | 'door_close' | 'gate_open' | 'gate_close' | 'elevator_call' |
          'system_error' | 'timeout' | 'invalid_credential' | 'schedule_violation';
  /** Method used to perform the action */
  method: 'app' | 'keypad' | 'card' | 'manual' | 'automatic' | 'physical_key' |
          'mobile_key' | 'admin_override' | 'emergency' | 'scheduled';
  /** Whether the action was successful */
  success: boolean;
  /** Specific reason for access denial (if applicable) */
  denial_reason?: 'invalid_credential' | 'out_of_schedule' | 'system_error' | 'device_offline' |
                  'insufficient_permissions' | 'expired_access' | 'maintenance_mode' | 'other';
  /** Human-readable explanation of the event */
  reason?: string;
  /** Physical location context (floor, wing, etc.) */
  location_context?: string;
  /** Session identifier for correlating related events */
  session_id?: string;
  /** Raw device response data for debugging */
  device_response?: Record<string, any>;
  /** Geographic latitude of the access attempt */
  latitude?: number;
  /** Geographic longitude of the access attempt */
  longitude?: number;
  /** Duration of the access event in seconds */
  duration_seconds?: number;
  /** IP address of the initiating system/app */
  ip_address?: string;
  /** Additional metadata for extensibility */
  metadata?: Record<string, any>;
  /** Timestamp when the event actually occurred */
  occurred_at: Date;
  /** Database record creation timestamp */
  created_at: Date;
  /** Database record last update timestamp */
  updated_at: Date;
}

/**
 * Access Log with Joined Details
 *
 * Extended log entry with joined relational data for reporting and display.
 * Includes human-readable names and additional context for UI presentation.
 */
export interface AccessLogWithDetails extends AccessLog {
  // Joined relational data for display purposes
  /** Human-readable facility name */
  facility_name?: string;
  /** Human-readable unit identifier */
  unit_number?: string;
  /** Full name of the user involved */
  user_name?: string;
  /** Email address of the user involved */
  user_email?: string;
  /** Full name of the primary tenant */
  primary_tenant_name?: string;
  /** Email address of the primary tenant */
  primary_tenant_email?: string;
  /** Human-readable device name */
  device_name?: string;
  /** Physical location description of the device */
  device_location?: string;
  /** Human-readable gateway name */
  gateway_name?: string;
}

export interface AccessLogFilters {
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  device_id?: string;
  device_type?: 'blulok' | 'access_control';
  action?: string;
  method?: string;
  success?: boolean;
  denial_reason?: string;
  credential_type?: string;
  primary_tenant_id?: string;
  user_accessible_units?: string[]; // For tenant filtering
  date_from?: Date;
  date_to?: Date;
  limit?: number;
  offset?: number;
  sort_by?: 'occurred_at' | 'user_name' | 'facility_name' | 'unit_number';
  sort_order?: 'asc' | 'desc';
}

export interface CreateAccessLogData {
  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  access_control_device_id?: string;
  gateway_id?: string;
  user_id?: string;
  primary_tenant_id?: string;
  credential_id?: string;
  credential_type?: 'physical_key' | 'mobile_app' | 'card' | 'keypad';
  action: string;
  method: string;
  success: boolean;
  denial_reason?: string;
  reason?: string;
  location_context?: string;
  session_id?: string;
  device_response?: Record<string, any>;
  latitude?: number;
  longitude?: number;
  duration_seconds?: number;
  ip_address?: string;
  metadata?: Record<string, any>;
}

export class AccessLogModel {
  private db = DatabaseService.getInstance();

  async findAll(filters: AccessLogFilters = {}): Promise<{ logs: AccessLogWithDetails[]; total: number }> {
    const knex = this.db.connection;
    
    let query = knex('access_logs')
      .select(
        'access_logs.*',
        'facilities.name as facility_name',
        'units.unit_number',
        'users.first_name as user_name',
        'users.email as user_email',
        'primary_tenant.first_name as primary_tenant_name',
        'primary_tenant.email as primary_tenant_email',
        'blulok_devices.device_serial as blulok_device_name',
        'access_control_devices.name as access_control_device_name',
        'access_control_devices.location_description as device_location',
        'gateways.name as gateway_name'
      )
      .leftJoin('facilities', 'access_logs.facility_id', 'facilities.id')
      .leftJoin('units', 'access_logs.unit_id', 'units.id')
      .leftJoin('users', 'access_logs.user_id', 'users.id')
      .leftJoin('users as primary_tenant', 'access_logs.primary_tenant_id', 'primary_tenant.id')
      .leftJoin('blulok_devices', function(this: any) {
        this.on('access_logs.device_id', '=', 'blulok_devices.id')
            .andOn('access_logs.device_type', '=', knex.raw('?', ['blulok']));
      })
      .leftJoin('access_control_devices', function(this: any) {
        this.on('access_logs.device_id', '=', 'access_control_devices.id')
            .andOn('access_logs.device_type', '=', knex.raw('?', ['access_control']));
      })
      .leftJoin('gateways', 'access_logs.gateway_id', 'gateways.id');

    // Apply filters
    if (filters.facility_id) {
      query = query.where('access_logs.facility_id', filters.facility_id);
    }
    if (filters.unit_id) {
      query = query.where('access_logs.unit_id', filters.unit_id);
    }
    if (filters.user_id) {
      query = query.where('access_logs.user_id', filters.user_id);
    }
    if (filters.device_id) {
      query = query.where('access_logs.device_id', filters.device_id);
    }
    if (filters.device_type) {
      query = query.where('access_logs.device_type', filters.device_type);
    }
    if (filters.action) {
      query = query.where('access_logs.action', filters.action);
    }
    if (filters.method) {
      query = query.where('access_logs.method', filters.method);
    }
    if (filters.success !== undefined) {
      query = query.where('access_logs.success', filters.success);
    }
    if (filters.denial_reason) {
      query = query.where('access_logs.denial_reason', filters.denial_reason);
    }
    if (filters.credential_type) {
      query = query.where('access_logs.credential_type', filters.credential_type);
    }
    if (filters.primary_tenant_id) {
      query = query.where('access_logs.primary_tenant_id', filters.primary_tenant_id);
    }
    if (filters.user_accessible_units && filters.user_accessible_units.length > 0) {
      query = query.whereIn('access_logs.unit_id', filters.user_accessible_units);
    }
    if (filters.date_from) {
      query = query.where('access_logs.occurred_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query = query.where('access_logs.occurred_at', '<=', filters.date_to);
    }

    // Get total count
    const countQuery = knex('access_logs');
    
    // Apply same filters to count query
    if (filters.facility_id) {
      countQuery.where('facility_id', filters.facility_id);
    }
    if (filters.unit_id) {
      countQuery.where('unit_id', filters.unit_id);
    }
    if (filters.user_id) {
      countQuery.where('user_id', filters.user_id);
    }
    if (filters.device_id) {
      countQuery.where('device_id', filters.device_id);
    }
    if (filters.device_type) {
      countQuery.where('device_type', filters.device_type);
    }
    if (filters.action) {
      countQuery.where('action', filters.action);
    }
    if (filters.method) {
      countQuery.where('method', filters.method);
    }
    if (filters.success !== undefined) {
      countQuery.where('success', filters.success);
    }
    if (filters.denial_reason) {
      countQuery.where('denial_reason', filters.denial_reason);
    }
    if (filters.credential_type) {
      countQuery.where('credential_type', filters.credential_type);
    }
    if (filters.primary_tenant_id) {
      countQuery.where('primary_tenant_id', filters.primary_tenant_id);
    }
    if (filters.user_accessible_units && filters.user_accessible_units.length > 0) {
      countQuery.whereIn('unit_id', filters.user_accessible_units);
    }
    if (filters.date_from) {
      countQuery.where('occurred_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      countQuery.where('occurred_at', '<=', filters.date_to);
    }
    
    const countResult = await countQuery.count('* as total').first();
    const total = (countResult as any)?.total || 0;

    // Apply sorting
    const sortBy = filters.sort_by || 'occurred_at';
    const sortOrder = filters.sort_order || 'desc';
    
    // Handle joined columns for sorting
    let sortColumn: string;
    switch (sortBy) {
      case 'user_name':
        sortColumn = 'users.first_name';
        break;
      case 'facility_name':
        sortColumn = 'facilities.name';
        break;
      case 'unit_number':
        sortColumn = 'units.unit_number';
        break;
      default:
        sortColumn = `access_logs.${sortBy}`;
        break;
    }
    
    query = query.orderBy(sortColumn, sortOrder);

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const logs = await query;
    return { logs: logs as AccessLogWithDetails[], total: total as number };
  }

  async findById(id: string): Promise<AccessLogWithDetails | null> {
    const knex = this.db.connection;
    const log = await knex('access_logs')
      .select(
        'access_logs.*',
        'facilities.name as facility_name',
        'units.unit_number',
        'users.first_name as user_name',
        'users.email as user_email',
        'primary_tenant.first_name as primary_tenant_name',
        'primary_tenant.email as primary_tenant_email',
        'blulok_devices.device_serial as blulok_device_name',
        'access_control_devices.name as access_control_device_name',
        'access_control_devices.location_description as device_location',
        'gateways.name as gateway_name'
      )
      .leftJoin('facilities', 'access_logs.facility_id', 'facilities.id')
      .leftJoin('units', 'access_logs.unit_id', 'units.id')
      .leftJoin('users', 'access_logs.user_id', 'users.id')
      .leftJoin('users as primary_tenant', 'access_logs.primary_tenant_id', 'primary_tenant.id')
      .leftJoin('blulok_devices', function(this: any) {
        this.on('access_logs.device_id', '=', 'blulok_devices.id')
            .andOn('access_logs.device_type', '=', knex.raw('?', ['blulok']));
      })
      .leftJoin('access_control_devices', function(this: any) {
        this.on('access_logs.device_id', '=', 'access_control_devices.id')
            .andOn('access_logs.device_type', '=', knex.raw('?', ['access_control']));
      })
      .leftJoin('gateways', 'access_logs.gateway_id', 'gateways.id')
      .where('access_logs.id', id)
      .first();
    
    return log || null;
  }

  async create(data: CreateAccessLogData): Promise<AccessLog> {
    const knex = this.db.connection;
    const [log] = await knex('access_logs').insert(data).returning('*');
    return log;
  }

  async getUserAccessHistory(userId: string, filters: Omit<AccessLogFilters, 'user_id'> = {}): Promise<{ logs: AccessLogWithDetails[]; total: number }> {
    return this.findAll({ ...filters, user_id: userId });
  }

  async getFacilityAccessHistory(facilityId: string, filters: Omit<AccessLogFilters, 'facility_id'> = {}): Promise<{ logs: AccessLogWithDetails[]; total: number }> {
    return this.findAll({ ...filters, facility_id: facilityId });
  }

  async getUnitAccessHistory(unitId: string, filters: Omit<AccessLogFilters, 'unit_id'> = {}): Promise<{ logs: AccessLogWithDetails[]; total: number }> {
    return this.findAll({ ...filters, unit_id: unitId });
  }

  async getSharedKeyAccessHistory(primaryTenantId: string, filters: Omit<AccessLogFilters, 'primary_tenant_id'> = {}): Promise<{ logs: AccessLogWithDetails[]; total: number }> {
    return this.findAll({ ...filters, primary_tenant_id: primaryTenantId });
  }
}
