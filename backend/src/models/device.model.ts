import { DatabaseService } from '../services/database.service';

export interface AccessControlDevice {
  id: string;
  gateway_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string;
  relay_channel: number;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  is_locked: boolean;
  last_activity?: Date;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface BluLokDevice {
  id: string;
  gateway_id: string;
  unit_id: string;
  device_serial: string;
  firmware_version?: string;
  lock_status: 'locked' | 'unlocked' | 'error' | 'maintenance';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
  last_activity?: Date;
  last_seen?: Date;
  device_settings?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceWithContext extends BluLokDevice {
  unit_number: string;
  unit_type?: string;
  facility_name: string;
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
  unit_id: string;
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
        'facilities.name as facility_name',
        'gateways.name as gateway_name'
      )
      .join('units', 'blulok_devices.unit_id', 'units.id')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .join('facilities', 'units.facility_id', 'facilities.id');

    if (filters.facility_id) {
      query = query.where('facilities.id', filters.facility_id);
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
      query = query.orderBy('units.unit_number', sortOrder);
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
      // Get primary tenant for this unit
      const primaryTenant = await knex('unit_assignments')
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

      const base: any = {
        id: row.id,
        gateway_id: row.gateway_id,
        unit_id: row.unit_id,
        device_serial: row.device_serial,
        firmware_version: row.firmware_version,
        lock_status: row.lock_status,
        device_status: row.device_status,
        battery_level: row.battery_level,
        last_activity: row.last_activity,
        last_seen: row.last_seen,
        device_settings: row.device_settings ? JSON.parse(row.device_settings) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
        unit_number: row.unit_number,
        unit_type: row.unit_type,
        facility_name: row.facility_name,
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

  async updateDeviceStatus(deviceId: string, deviceType: 'access_control' | 'blulok', status: string): Promise<void> {
    const knex = this.db.connection;
    const table = deviceType === 'access_control' ? 'access_control_devices' : 'blulok_devices';
    const statusField = deviceType === 'access_control' ? 'status' : 'device_status';
    
    await knex(table).where('id', deviceId).update({
      [statusField]: status,
      last_seen: new Date(),
      updated_at: new Date()
    });
  }

  async updateLockStatus(deviceId: string, lockStatus: 'locked' | 'unlocked' | 'error'): Promise<void> {
    const knex = this.db.connection;
    await knex('blulok_devices').where('id', deviceId).update({
      lock_status: lockStatus,
      last_activity: new Date(),
      updated_at: new Date()
    });
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
      .join('units', 'blulok_devices.unit_id', 'units.id')
      .join('facilities', 'units.facility_id', 'facilities.id');

    if (filters.facility_id) {
      query = query.where('units.facility_id', filters.facility_id);
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
}