import { DatabaseService } from '../services/database.service';

export interface Gateway {
  id: string;
  facility_id: string;
  name: string;
  model?: string;
  firmware_version?: string;
  ip_address?: string;
  mac_address?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_seen?: Date;
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGatewayData {
  facility_id: string;
  name: string;
  model?: string;
  firmware_version?: string;
  ip_address?: string;
  mac_address?: string;
  status?: 'online' | 'offline' | 'error' | 'maintenance';
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateGatewayData extends Partial<Omit<CreateGatewayData, 'facility_id'>> {}

export class GatewayModel {
  private db = DatabaseService.getInstance();

  async findAll(): Promise<Gateway[]> {
    const knex = this.db.connection;
    return await knex('gateways').select('*').orderBy('name');
  }

  async findByFacilityId(facilityId: string): Promise<Gateway | null> {
    const knex = this.db.connection;
    const gateway = await knex('gateways').where('facility_id', facilityId).first();
    return gateway || null;
  }

  async findById(id: string): Promise<Gateway | null> {
    const knex = this.db.connection;
    const gateway = await knex('gateways').where('id', id).first();
    return gateway || null;
  }

  async create(data: CreateGatewayData): Promise<Gateway> {
    const knex = this.db.connection;
    const [id] = await knex('gateways').insert(data);
    return await this.findById(String(id)) as Gateway;
  }

  async update(id: string, data: UpdateGatewayData): Promise<Gateway | null> {
    const knex = this.db.connection;
    
    // Filter out undefined and null values to prevent SQL syntax errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null)
    );
    
    await knex('gateways').where('id', id).update({
      ...cleanData,
      updated_at: new Date()
    });
    return await this.findById(id);
  }

  async updateStatus(id: string, status: Gateway['status']): Promise<void> {
    const knex = this.db.connection;
    await knex('gateways').where('id', id).update({
      status,
      last_seen: status === 'online' ? new Date() : undefined,
      updated_at: new Date()
    });
  }

  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    const deleted = await knex('gateways').where('id', id).del();
    return deleted > 0;
  }

  async getGatewayWithDevices(id: string): Promise<{
    gateway: Gateway;
    accessControlDevices: any[];
    blulokDevices: any[];
  } | null> {
    const knex = this.db.connection;
    
    const gateway = await this.findById(id);
    if (!gateway) return null;

    const accessControlDevices = await knex('access_control_devices')
      .where('gateway_id', id)
      .orderBy('relay_channel');

    const blulokDevices = await knex('blulok_devices')
      .select('blulok_devices.*', 'units.unit_number', 'units.unit_type')
      .join('units', 'blulok_devices.unit_id', 'units.id')
      .where('blulok_devices.gateway_id', id)
      .orderBy('units.unit_number');

    return {
      gateway,
      accessControlDevices,
      blulokDevices
    };
  }
}
