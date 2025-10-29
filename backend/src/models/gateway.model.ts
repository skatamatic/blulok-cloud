import { DatabaseService } from '../services/database.service';

/**
 * Gateway Entity Interface
 *
 * Represents a network gateway that connects the BluLok cloud to physical facilities.
 * Gateways are the communication bridges that manage device connectivity, protocol
 * translation, and secure command execution.
 *
 * Gateway Types:
 * - physical: WebSocket-based gateways for direct device control
 * - http: HTTP API gateways for cloud-managed facilities
 * - simulated: Testing gateways that mimic real device behavior
 *
 * Key Management Evolution:
 * - v1: Legacy Postman hex format (deprecated)
 * - v2: Modern Ed25519 cryptographic signatures
 *
 * Network Configuration:
 * - Physical gateways use WebSocket connections
 * - HTTP gateways poll for updates and commands
 * - SSL certificate validation can be disabled for testing
 *
 * Device Management:
 * - Gateways aggregate status from multiple device types
 * - Handle firmware updates and configuration changes
 * - Provide real-time connectivity monitoring
 */
export interface Gateway {
  /** Primary key - unique gateway identifier */
  id: string;
  /** Foreign key to facilities table - facility this gateway serves */
  facility_id: string;
  /** Human-readable gateway name for identification */
  name: string;
  /** Hardware model identifier */
  model?: string;
  /** Current firmware version running on the gateway */
  firmware_version?: string;
  /** Gateway's IP address for network identification */
  ip_address?: string;
  /** Gateway's MAC address for hardware identification */
  mac_address?: string;
  /** Current operational status of the gateway */
  status: 'online' | 'offline' | 'error' | 'maintenance';
  /** Timestamp of last successful communication */
  last_seen?: Date;
  /** Gateway-specific configuration settings */
  configuration?: Record<string, any>;
  /** Extensible metadata for gateway-specific attributes */
  metadata?: Record<string, any>;
  /** Gateway communication protocol type */
  gateway_type?: 'physical' | 'http' | 'simulated';
  /** WebSocket URL for physical gateway connections */
  connection_url?: string;
  /** Base URL for HTTP API gateway connections */
  base_url?: string;
  /** API key for HTTP gateway authentication */
  api_key?: string;
  /** Username for HTTP gateway authentication */
  username?: string;
  /** Encrypted password for HTTP gateway authentication */
  password?: string;
  /** Communication protocol version */
  protocol_version?: string;
  /** Polling frequency in milliseconds for HTTP gateways */
  poll_frequency_ms?: number;
  /** Key management protocol version (v1 legacy, v2 modern) */
  key_management_version: 'v1' | 'v2';
  /** Whether to ignore SSL certificate validation (for testing) */
  ignore_ssl_cert?: boolean;
  /** Gateway registration timestamp */
  created_at: Date;
  /** Last configuration update timestamp */
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
  // Gateway connection configuration
  gateway_type?: 'physical' | 'http' | 'simulated';
  connection_url?: string;
  base_url?: string;
  api_key?: string;
  username?: string;
  password?: string;
  protocol_version?: string;
  key_management_version?: 'v1' | 'v2';
  ignore_ssl_cert?: boolean;
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

  async updateStatusAndLastSeen(id: string, status: Gateway['status']): Promise<void> {
    const knex = this.db.connection;
    await knex('gateways').where('id', id).update({
      status,
      last_seen: new Date(),
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
