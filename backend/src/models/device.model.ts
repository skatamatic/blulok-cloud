import { DatabaseService } from '../services/database.service';
import { DeviceEventService } from '../services/device-event.service';

/**
 * Device Models
 *
 * Comprehensive device management for the BluLok system, supporting both
 * primary BluLok smart locks and secondary access control devices.
 *
 * Key Features:
 * - Dual device type architecture (BluLok primary + access control secondary)
 * - Real-time status monitoring and health tracking
 * - Battery level monitoring for wireless devices
 * - Firmware version management and updates
 * - Geographic location tracking and facility association
 * - Comprehensive event logging and state management
 *
 * Device Types:
 * - BluLok Devices: Primary smart locks with cryptographic access control
 * - Access Control Devices: Gates, elevators, doors with relay control
 *
 * Status Monitoring:
 * - Online/offline connectivity tracking
 * - Battery level and low battery alerts
 * - Lock status for security monitoring
 * - Maintenance mode for service operations
 * - Error state detection and recovery
 *
 * Security Considerations:
 * - Device authentication and authorization
 * - Secure firmware update mechanisms
 * - Tamper detection and reporting
 * - Audit logging for all device operations
 * - Secure credential management
 */

/**
 * Access Control Device Interface
 *
 * Represents secondary access control devices like gates, elevators, and doors.
 * These devices provide extended access control beyond primary BluLok locks.
 */
export interface AccessControlDevice {
  /** Globally unique identifier for the device */
  id: string;
  /** Gateway managing this device */
  gateway_id: string;
  /** Human-readable device name */
  name: string;
  /** Type classification of access control device */
  device_type: 'gate' | 'elevator' | 'door';
  /** Detailed location description */
  location_description?: string;
  /** Relay channel number for control */
  relay_channel: number;
  /** Current operational status */
  status: 'online' | 'offline' | 'error' | 'maintenance';
  /** Current lock state of the device */
  is_locked: boolean;
  /** Timestamp of last device activity */
  last_activity?: Date;
  /** Device-specific configuration settings */
  device_settings?: Record<string, any>;
  /** Additional metadata for extensibility */
  metadata?: Record<string, any>;
  /** Automatic record creation timestamp */
  created_at: Date;
  /** Automatic record update timestamp */
  updated_at: Date;
}

/**
 * BluLok Device Interface
 *
 * Primary smart lock devices with advanced cryptographic access control.
 * These are the core devices providing secure access to storage units.
 */
export interface BluLokDevice {
  /** Globally unique identifier for the device */
  id: string;
  /** Gateway managing this device */
  gateway_id: string;
  /** Associated storage unit identifier (nullable - devices can exist without unit assignment) */
  unit_id: string | null;
  /** Manufacturer-assigned serial number */
  device_serial: string;
  /** Current firmware version installed */
  firmware_version?: string;
  /** Current lock mechanism status */
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  /** Overall device connectivity and health status */
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  /** Battery charge level (0-100) */
  battery_level?: number;
  /** Wireless signal strength in dBm */
  signal_strength?: number;
  /** Device temperature reading */
  temperature?: number;
  /** Error code for error states */
  error_code?: string | null;
  /** Human-readable error description */
  error_message?: string | null;
  /** Timestamp of last device command/activity */
  last_activity?: Date;
  /** Timestamp of last successful communication */
  last_seen?: Date;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Partial device state update interface for gateway state updates.
 * All fields except lock_id are optional to support partial updates.
 * 
 * Matches the gateway payload format:
 * - state: 'CLOSED' | 'OPENED' (gateway sends this, maps to lock_status)
 * - lock_state: Legacy field, still supported
 * - locked: Boolean lock status
 * - battery_level: Raw value in mV (not percentage)
 * - battery_unit: Unit for battery (e.g., 'mV')
 * - temperature_value: Temperature reading
 * - temperature_unit: Unit for temperature (e.g., '°C')
 */
export interface DeviceStateUpdate {
  /** Lock identifier (UUID or serial) - required */
  lock_id: string;
  /** Lock number for display */
  lock_number?: number;
  /** Device state from gateway: 'CLOSED' = locked, 'OPENED' = unlocked */
  state?: 'CLOSED' | 'OPENED' | 'ERROR' | 'UNKNOWN';
  /** Legacy lock state field */
  lock_state?: 'LOCKED' | 'UNLOCKED' | 'LOCKING' | 'UNLOCKING' | 'ERROR' | 'UNKNOWN';
  /** Boolean lock status */
  locked?: boolean;
  /** Battery level in raw units (mV) - no longer 0-100 */
  battery_level?: number;
  /** Battery unit (e.g., 'mV') */
  battery_unit?: string;
  /** Device online status */
  online?: boolean;
  /** Signal strength */
  signal_strength?: number;
  /** Temperature value */
  temperature?: number;
  /** Temperature value (alternative field name) */
  temperature_value?: number;
  /** Temperature unit (e.g., '°C') */
  temperature_unit?: string;
  /** Firmware version string */
  firmware_version?: string;
  /** Last seen timestamp */
  last_seen?: string | Date;
  /** Error code */
  error_code?: string | null;
  /** Human-readable error message */
  error_message?: string | null;
  /** Source of the update */
  source?: 'GATEWAY' | 'USER' | 'CLOUD';
}

export interface DeviceWithContext extends BluLokDevice {
  unit_number: string | null; // Nullable for devices not yet assigned to units
  unit_type?: string | null;
  facility_name: string | null; // Nullable for devices without units (can get from gateway)
  gateway_name: string;
  primary_tenant?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface CreateAccessControlDeviceData {
  gateway_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string;
  relay_channel: number;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateBluLokDeviceData {
  gateway_id: string;
  unit_id?: string; // Optional - devices can exist without unit association
  device_serial: string;
  firmware_version?: string;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DeviceFilters {
  facility_id?: string;
  gateway_id?: string;
  unit_id?: string;
  device_type?: 'access_control' | 'blulok' | 'all';
  status?: string;
  search?: string;
  sortBy?: 'name' | 'unit_number' | 'facility_name' | 'gateway_name' | 'device_type' | 'status' | 'last_activity' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export class DeviceModel {
  private db = DatabaseService.getInstance();
  private eventService = DeviceEventService.getInstance();

  /**
   * Safely parse JSON fields that may already be parsed objects or still be strings
   */
  private safeParseJson(value: any): any {
    if (value === null || value === undefined) {
      return undefined;
    }
    // If it's already an object or array, return it as-is
    if (typeof value === 'object') {
      return value;
    }
    // If it's a string, try to parse it
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn('Failed to parse JSON field:', e);
        return undefined;
      }
    }
    return undefined;
  }

  async findAccessControlDevices(filters: DeviceFilters = {}): Promise<AccessControlDevice[]> {
    const knex = this.db.connection;
    let query = knex('access_control_devices')
      .select('access_control_devices.*')
      .join('gateways', 'access_control_devices.gateway_id', 'gateways.id');

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.gateway_id) {
      query = query.where('access_control_devices.gateway_id', filters.gateway_id);
    }

    if (filters.status) {
      query = query.where('access_control_devices.status', filters.status);
    }

    if (filters.search) {
      query = query.where(function(this: any) {
        this.where('access_control_devices.name', 'like', `%${filters.search}%`)
            .orWhere('access_control_devices.location_description', 'like', `%${filters.search}%`);
      });
    }

    const sortBy = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'asc';
    query = query.orderBy(`access_control_devices.${sortBy}`, sortOrder);

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }

  async findBluLokDevices(filters: DeviceFilters = {}): Promise<DeviceWithContext[]> {
    const knex = this.db.connection;
    let query = knex('blulok_devices')
      .select(
        'blulok_devices.*',
        'units.unit_number',
        'units.unit_type',
        'facilities.name as facility_name', // Always from gateway - devices belong to gateway's facility
        'gateways.name as gateway_name',
        'gateways.facility_id as gateway_facility_id'
      )
      .leftJoin('units', 'blulok_devices.unit_id', 'units.id')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .join('facilities', 'gateways.facility_id', 'facilities.id'); // Facility via gateway - authoritative source

    if ((filters as any).id) {
      query = query.where('blulok_devices.id', (filters as any).id);
    }

    if (filters.facility_id) {
      // Filter by gateway's facility - this is the authoritative facility for the device
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.gateway_id) {
      query = query.where('blulok_devices.gateway_id', filters.gateway_id);
    }

    if (filters.status) {
      query = query.where('blulok_devices.device_status', filters.status);
    }

    if (filters.search) {
      query = query.where(function(this: any) {
        this.where('units.unit_number', 'like', `%${filters.search}%`)
            .orWhere('blulok_devices.device_serial', 'like', `%${filters.search}%`);
      });
    }

    const sortBy = (filters.sortBy || 'unit_number') as string;
    const sortOrder = filters.sortOrder || 'asc';
    
    if (sortBy === 'name' || sortBy === 'unit_number') {
      // For devices without units, sort by device_serial
      query = query.orderByRaw('COALESCE(units.unit_number, blulok_devices.device_serial) ' + sortOrder);
    } else if (sortBy === 'facility_name') {
      query = query.orderBy('facilities.name', sortOrder);
    } else if (sortBy === 'gateway_name') {
      query = query.orderBy('gateways.name', sortOrder);
    } else {
      // For other sortBy values, use them directly on blulok_devices table
      query = query.orderBy(`blulok_devices.${sortBy}`, sortOrder);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const results = await query;
    
    // Get primary tenant data separately for each device
    const mapped: DeviceWithContext[] = [];
    for (const row of results) {
      // Get primary tenant for this unit (only if unit_id is not null)
      let primaryTenant = null;
      if (row.unit_id) {
        primaryTenant = await knex('unit_assignments')
          .select(
            'users.id',
            'users.first_name',
            'users.last_name',
            'users.email'
          )
          .join('users', 'unit_assignments.tenant_id', 'users.id')
          .where('unit_assignments.unit_id', row.unit_id)
          .where('unit_assignments.is_primary', true)
          .first();
      }

      const base: any = {
        id: row.id,
        gateway_id: row.gateway_id,
        facility_id: row.gateway_facility_id,
        unit_id: row.unit_id,
        device_serial: row.device_serial,
        firmware_version: row.firmware_version,
        lock_status: row.lock_status,
        device_status: row.device_status,
        battery_level: row.battery_level,
        signal_strength: row.signal_strength,
        temperature: row.temperature,
        error_code: row.error_code,
        error_message: row.error_message,
        last_activity: row.last_activity,
        last_seen: row.last_seen,
        device_settings: this.safeParseJson(row.device_settings),
        metadata: this.safeParseJson(row.metadata),
        created_at: row.created_at,
        updated_at: row.updated_at,
        unit_number: row.unit_number || null,
        unit_type: row.unit_type || null,
        facility_name: row.facility_name, // Always populated from gateway's facility
        gateway_name: row.gateway_name,
      };

      if (primaryTenant) {
        base.primary_tenant = {
          id: primaryTenant.id,
          firstName: primaryTenant.first_name,
          lastName: primaryTenant.last_name,
          email: primaryTenant.email,
        };
      }

      mapped.push(base as DeviceWithContext);
    }

    return mapped;
  }

  async findBluLokDeviceById(id: string): Promise<DeviceWithContext | null> {
    const results = await this.findBluLokDevices({ ...(undefined as any), id } as any);
    return results[0] || null;
  }

  async createAccessControlDevice(data: CreateAccessControlDeviceData): Promise<AccessControlDevice> {
    const knex = this.db.connection;
    const [id] = await knex('access_control_devices').insert(data);
    const device = await knex('access_control_devices').where('id', id).first();
    return device as AccessControlDevice;
  }

  async createBluLokDevice(data: CreateBluLokDeviceData): Promise<BluLokDevice> {
    const knex = this.db.connection;
    const [id] = await knex('blulok_devices').insert(data);
    const device = await knex('blulok_devices').where('id', id).first();
    return device as BluLokDevice;
  }

  /**
   * Bulk create BluLok devices in a single database operation.
   * PERFORMANCE: Much more efficient than sequential inserts for gateway provisioning.
   * 
   * @param devices - Array of device data to insert
   * @returns Number of devices successfully created
   */
  async bulkCreateBluLokDevices(devices: CreateBluLokDeviceData[]): Promise<number> {
    if (devices.length === 0) return 0;
    const knex = this.db.connection;
    await knex('blulok_devices').insert(devices);
    return devices.length;
  }

  /**
   * Bulk delete BluLok devices by their IDs.
   * PERFORMANCE: Much more efficient than sequential deletes.
   * 
   * @param deviceIds - Array of device IDs to delete
   * @returns Number of devices deleted
   */
  async bulkDeleteBluLokDevices(deviceIds: string[]): Promise<number> {
    if (deviceIds.length === 0) return 0;
    const knex = this.db.connection;
    return await knex('blulok_devices').whereIn('id', deviceIds).del();
  }

  async updateDeviceStatus(deviceId: string, deviceType: 'access_control' | 'blulok', status: string): Promise<void> {
    const knex = this.db.connection;
    const table = deviceType === 'access_control' ? 'access_control_devices' : 'blulok_devices';
    const statusField = deviceType === 'access_control' ? 'status' : 'device_status';

    // Get current status before update
    const currentDevice = await knex(table).where('id', deviceId).select(statusField, 'gateway_id').first();
    const oldStatus = currentDevice ? currentDevice[statusField] : null;

    // Update the device
    await knex(table).where('id', deviceId).update({
      [statusField]: status,
      last_seen: new Date(),
      updated_at: new Date()
    });

    // Emit event if status changed
    if (oldStatus !== status && currentDevice) {
      this.eventService.emitDeviceStatusChanged({
        deviceId,
        deviceType,
        oldStatus: oldStatus || 'unknown',
        newStatus: status,
        gatewayId: currentDevice.gateway_id
      });
    }
  }

  async updateLockStatus(
    deviceId: string,
    lockStatus: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown',
  ): Promise<void> {
    const knex = this.db.connection;

    // Get current lock status and unit info before update
    const currentDevice = await knex('blulok_devices')
      .where('id', deviceId)
      .select('lock_status', 'gateway_id', 'unit_id')
      .first();
    const oldStatus = currentDevice ? currentDevice.lock_status : null;

    // Update the device
    await knex('blulok_devices').where('id', deviceId).update({
      lock_status: lockStatus,
      last_activity: new Date(),
      updated_at: new Date()
    });

    // Emit event if status changed
    if (oldStatus !== lockStatus && currentDevice) {
      this.eventService.emitLockStatusChanged({
        deviceId,
        oldStatus: oldStatus || 'unknown',
        newStatus: lockStatus,
        gatewayId: currentDevice.gateway_id,
        unitId: currentDevice.unit_id
      });
    }
  }

  /**
   * Delete a BluLok device
   */
  async deleteBluLokDevice(deviceId: string): Promise<void> {
    const knex = this.db.connection;
    await knex('blulok_devices').where('id', deviceId).del();
  }

  /**
   * Delete an access control device
   */
  async deleteAccessControlDevice(deviceId: string): Promise<void> {
    const knex = this.db.connection;
    await knex('access_control_devices').where('id', deviceId).del();
  }

  /**
   * Update battery level for a BluLok device
   */
  async updateBatteryLevel(deviceId: string, batteryLevel: number): Promise<void> {
    const knex = this.db.connection;

    // Get current battery level before update
    const currentDevice = await knex('blulok_devices')
      .where('id', deviceId)
      .select('battery_level')
      .first();
    const oldBatteryLevel = currentDevice ? currentDevice.battery_level : null;

    // Update battery level
    await knex('blulok_devices').where('id', deviceId).update({
      battery_level: batteryLevel,
      updated_at: new Date()
    });

    // TODO: Emit battery level changed event if needed
    if (oldBatteryLevel !== batteryLevel) {
      console.log(`Updated battery level for device ${deviceId}: ${oldBatteryLevel}% -> ${batteryLevel}%`);
    }
  }

  /**
   * Update BluLok device state with partial data.
   * Only updates fields that are provided, leaving others unchanged.
   * 
   * @param deviceId - The device ID (can be UUID or serial number)
   * @param updates - Partial state updates to apply
   * @returns Promise resolving to true if device was found and updated
   */
  async updateBluLokDeviceState(
    deviceId: string,
    updates: Partial<{
      lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
      device_status: 'online' | 'offline' | 'low_battery' | 'error';
      battery_level: number;
      signal_strength: number;
      temperature: number;
      error_code: string | null;
      error_message: string | null;
      firmware_version: string;
      last_seen: Date;
    }>
  ): Promise<boolean> {
    const knex = this.db.connection;

    // Build update object with only non-undefined fields
    const updateData: Record<string, any> = {};
    
    if (updates.lock_status !== undefined) {
      updateData.lock_status = updates.lock_status;
      updateData.last_activity = new Date();
    }
    if (updates.device_status !== undefined) {
      updateData.device_status = updates.device_status;
    }
    if (updates.battery_level !== undefined) {
      updateData.battery_level = updates.battery_level;
    }
    if (updates.signal_strength !== undefined) {
      updateData.signal_strength = updates.signal_strength;
    }
    if (updates.temperature !== undefined) {
      updateData.temperature = updates.temperature;
    }
    if (updates.error_code !== undefined) {
      updateData.error_code = updates.error_code;
    }
    if (updates.error_message !== undefined) {
      updateData.error_message = updates.error_message;
    }
    if (updates.firmware_version !== undefined) {
      updateData.firmware_version = updates.firmware_version;
    }
    if (updates.last_seen !== undefined) {
      updateData.last_seen = updates.last_seen;
    }

    // Always update updated_at
    updateData.updated_at = new Date();

    // If no meaningful updates, skip
    if (Object.keys(updateData).length <= 1) {
      return false;
    }

    // Get current device state before update for event emission
    let device = await knex('blulok_devices')
      .where('id', deviceId)
      .select('id', 'lock_status', 'device_status', 'gateway_id', 'unit_id')
      .first();

    if (!device) {
      // Try by device_serial
      device = await knex('blulok_devices')
        .where('device_serial', deviceId)
        .select('id', 'lock_status', 'device_status', 'gateway_id', 'unit_id')
        .first();
    }

    if (!device) {
      return false;
    }

    const oldLockStatus = device.lock_status;
    const oldDeviceStatus = device.device_status;

    // Apply update
    await knex('blulok_devices')
      .where('id', device.id)
      .update(updateData);

    // Track if any meaningful change was made
    let statusChanged = false;

    // Emit events for status changes to trigger WebSocket broadcasts
    if (updates.lock_status && updates.lock_status !== oldLockStatus) {
      this.eventService.emitLockStatusChanged({
        deviceId: device.id,
        oldStatus: oldLockStatus || 'unknown',
        newStatus: updates.lock_status,
        gatewayId: device.gateway_id,
        unitId: device.unit_id
      });
      statusChanged = true;
    }

    if (updates.device_status && updates.device_status !== oldDeviceStatus) {
      this.eventService.emitDeviceStatusChanged({
        deviceId: device.id,
        deviceType: 'blulok',
        oldStatus: oldDeviceStatus || 'unknown',
        newStatus: updates.device_status,
        gatewayId: device.gateway_id
      });
      statusChanged = true;
    }

    // If no status change but telemetry fields were updated, emit telemetry event
    // This ensures WebSocket broadcasts happen for battery, signal, temperature updates
    if (!statusChanged && (
      updates.battery_level !== undefined ||
      updates.signal_strength !== undefined ||
      updates.temperature !== undefined ||
      updates.error_code !== undefined ||
      updates.firmware_version !== undefined
    )) {
      this.eventService.emitDeviceTelemetryUpdated({
        deviceId: device.id,
        gatewayId: device.gateway_id,
      });
    }

    return true;
  }

  /**
   * Find a BluLok device by its ID or serial number.
   * 
   * @param lockId - The device ID (UUID) or serial number
   * @returns Promise resolving to the device or null if not found
   */
  async findBluLokDeviceByIdOrSerial(lockId: string): Promise<BluLokDevice | null> {
    const knex = this.db.connection;

    // Try by ID first
    let device = await knex('blulok_devices').where('id', lockId).first();
    
    if (!device) {
      // Try by device_serial
      device = await knex('blulok_devices').where('device_serial', lockId).first();
    }

    return device || null;
  }

  async getFacilityDeviceHierarchy(facilityId: string): Promise<{
    facility: any;
    gateway: any;
    accessControlDevices: AccessControlDevice[];
    blulokDevices: DeviceWithContext[];
  } | null> {
    const knex = this.db.connection;
    
    // Get facility
    const facility = await knex('facilities').where('id', facilityId).first();
    if (!facility) return null;

    // Get gateway
    const gateway = await knex('gateways').where('facility_id', facilityId).first();
    if (!gateway) return { facility, gateway: null, accessControlDevices: [], blulokDevices: [] };

    // Get devices
    const accessControlDevices = await this.findAccessControlDevices({ gateway_id: gateway.id });
    const blulokDevices = await this.findBluLokDevices({ gateway_id: gateway.id });

    return {
      facility,
      gateway,
      accessControlDevices,
      blulokDevices
    };
  }

  async countAccessControlDevices(filters: DeviceFilters = {}): Promise<number> {
    const knex = this.db.connection;
    let query = knex('access_control_devices')
      .join('gateways', 'access_control_devices.gateway_id', 'gateways.id');

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.gateway_id) {
      query = query.where('access_control_devices.gateway_id', filters.gateway_id);
    }

    if (filters.device_type && filters.device_type !== 'all') {
      query = query.where('access_control_devices.device_type', filters.device_type);
    }

    if (filters.status) {
      query = query.where('access_control_devices.status', filters.status);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('access_control_devices.name', 'like', `%${filters.search}%`)
          .orWhere('access_control_devices.location_description', 'like', `%${filters.search}%`);
      });
    }

    const result = await query.count('* as count').first();
    return parseInt(result?.count as string) || 0;
  }

  async countBluLokDevices(filters: DeviceFilters = {}): Promise<number> {
    const knex = this.db.connection;
    let query = knex('blulok_devices')
      .leftJoin('units', 'blulok_devices.unit_id', 'units.id')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .join('facilities', 'gateways.facility_id', 'facilities.id'); // Facility via gateway - authoritative

    if (filters.facility_id) {
      // Filter by gateway's facility - this is the authoritative facility for the device
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.unit_id) {
      query = query.where('blulok_devices.unit_id', filters.unit_id);
    }

    if (filters.device_type && filters.device_type !== 'all') {
      query = query.where('blulok_devices.device_type', filters.device_type);
    }

    if (filters.status) {
      query = query.where('blulok_devices.device_status', filters.status);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('blulok_devices.device_serial', 'like', `%${filters.search}%`)
          .orWhere('units.unit_number', 'like', `%${filters.search}%`)
          .orWhere('facilities.name', 'like', `%${filters.search}%`);
      });
    }

    const result = await query.count('* as count').first();
    return parseInt(result?.count as string) || 0;
  }

  /**
   * Assign a device to a unit
   */
  async assignDeviceToUnit(deviceId: string, unitId: string): Promise<void> {
    const knex = this.db.connection;
    await knex('blulok_devices')
      .where('id', deviceId)
      .update({
        unit_id: unitId,
        updated_at: new Date()
      });
  }

  /**
   * Unassign a device from a unit
   */
  async unassignDeviceFromUnit(deviceId: string): Promise<void> {
    const knex = this.db.connection;
    await knex('blulok_devices')
      .where('id', deviceId)
      .update({
        unit_id: null,
        updated_at: new Date()
      });
  }

  /**
   * Find unassigned BluLok devices
   */
  async findUnassignedDevices(filters: DeviceFilters = {}): Promise<DeviceWithContext[]> {
    const knex = this.db.connection;
    let query = knex('blulok_devices')
      .select(
        'blulok_devices.*',
        'units.unit_number',
        'units.unit_type',
        'facilities.name as facility_name',
        'gateways.name as gateway_name',
        'gateways.facility_id as gateway_facility_id'
      )
      .leftJoin('units', 'blulok_devices.unit_id', 'units.id')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .join('facilities', 'gateways.facility_id', 'facilities.id')
      .whereNull('blulok_devices.unit_id'); // Only unassigned devices

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.gateway_id) {
      query = query.where('blulok_devices.gateway_id', filters.gateway_id);
    }

    if (filters.status) {
      query = query.where('blulok_devices.device_status', filters.status);
    }

    if (filters.search) {
      query = query.where(function(this: any) {
        this.where('blulok_devices.device_serial', 'like', `%${filters.search}%`)
            .orWhere('facilities.name', 'like', `%${filters.search}%`)
            .orWhere('gateways.name', 'like', `%${filters.search}%`);
      });
    }

    const sortBy = (filters.sortBy || 'device_serial') as string;
    const sortOrder = filters.sortOrder || 'asc';
    
    if (sortBy === 'facility_name') {
      query = query.orderBy('facilities.name', sortOrder);
    } else if (sortBy === 'gateway_name') {
      query = query.orderBy('gateways.name', sortOrder);
    } else {
      query = query.orderBy(`blulok_devices.${sortBy}`, sortOrder);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const results = await query;
    
    // Map results to DeviceWithContext format
    const mapped: DeviceWithContext[] = results.map((row: any) => ({
      id: row.id,
      gateway_id: row.gateway_id,
      unit_id: null, // Always null for unassigned devices
      device_serial: row.device_serial,
      firmware_version: row.firmware_version,
      lock_status: row.lock_status,
      device_status: row.device_status,
      battery_level: row.battery_level,
      last_activity: row.last_activity,
      last_seen: row.last_seen,
      device_settings: this.safeParseJson(row.device_settings),
      metadata: this.safeParseJson(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
      unit_number: null,
      unit_type: null,
      facility_name: row.facility_name,
      gateway_name: row.gateway_name
    }));

    return mapped;
  }

  /**
   * Count unassigned BluLok devices
   */
  async countUnassignedDevices(filters: DeviceFilters = {}): Promise<number> {
    const knex = this.db.connection;
    let query = knex('blulok_devices')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .join('facilities', 'gateways.facility_id', 'facilities.id')
      .whereNull('blulok_devices.unit_id'); // Only unassigned devices

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    }

    if (filters.gateway_id) {
      query = query.where('blulok_devices.gateway_id', filters.gateway_id);
    }

    if (filters.status) {
      query = query.where('blulok_devices.device_status', filters.status);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('blulok_devices.device_serial', 'like', `%${filters.search}%`)
          .orWhere('facilities.name', 'like', `%${filters.search}%`)
          .orWhere('gateways.name', 'like', `%${filters.search}%`);
      });
    }

    const result = await query.count('* as count').first();
    return parseInt(result?.count as string) || 0;
  }
}