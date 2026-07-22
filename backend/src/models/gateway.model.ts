import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/database.service';
import { isDuplicateKeyError } from '@/utils/gateway-auto-register.utils';
import {
  resolveBoundGatewayDisplayName,
  unboundGatewayDisplayName,
  withOperatorSetGatewayDisplayName,
} from '@/utils/gateway-display-name.utils';
import {
  getZtpIntendedFacilityId,
  withZtpIntendedFacilityId,
  withoutZtpIntendedFacilityId,
} from '@/utils/gateway-ztp-claim.utils';

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
  facility_id: string | null;
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
  /** Compressed P-256 public key (base64url) for ZTP / challenge-response AUTH */
  public_key?: string | null;
  /** User who completed sticker claim */
  claimed_by_user_id?: string | null;
  claimed_at?: Date | null;
  released_at?: Date | null;
  revoked_at?: Date | null;
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
    const gateway = await knex('gateways')
      .where('facility_id', facilityId)
      .orderBy('updated_at', 'desc')
      .first();
    return gateway || null;
  }

  async findBoundGatewaysWithContext(filters: {
    facility_id?: string;
    facility_ids?: string[];
    gateway_id?: string;
    search?: string;
    status?: string;
  } = {}): Promise<Array<Gateway & { facility_name?: string | null }>> {
    const knex = this.db.connection;
    let query = knex('gateways')
      .select('gateways.*', 'facilities.name as facility_name')
      .leftJoin('facilities', 'gateways.facility_id', 'facilities.id')
      .whereNotNull('gateways.facility_id');

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    } else if (filters.facility_ids && filters.facility_ids.length > 0) {
      query = query.whereIn('gateways.facility_id', filters.facility_ids);
    }

    if (filters.gateway_id) {
      query = query.where('gateways.id', filters.gateway_id);
    }

    if (filters.search) {
      const pattern = `%${filters.search.trim()}%`;
      query = query.where((builder) => {
        builder
          .where('gateways.name', 'like', pattern)
          .orWhere('gateways.mac_address', 'like', pattern);
      });
    }

    if (filters.status) {
      query = query.where('gateways.status', filters.status);
    }

    return query.orderBy('gateways.name', 'asc');
  }

  async findById(id: string): Promise<Gateway | null> {
    const knex = this.db.connection;
    const gateway = await knex('gateways').where('id', id).first();
    return gateway || null;
  }

  async create(data: CreateGatewayData): Promise<Gateway> {
    const knex = this.db.connection;
    const id = uuidv4();
    await knex('gateways').insert({ ...data, id });
    return (await this.findById(id)) as Gateway;
  }

  /**
   * Insert a gateway row honoring a caller-supplied primary key (the device's
   * self-generated GUID). Used by WebSocket auto-registration. `facility_id`
   * may be null for an unbound swap candidate.
   */
  async createWithId(
    id: string,
    data: Partial<Omit<CreateGatewayData, 'facility_id'>> & { facility_id: string | null },
  ): Promise<Gateway> {
    const knex = this.db.connection;
    const { metadata, configuration, ...rest } = data;
    await knex('gateways').insert({
      gateway_type: 'physical',
      key_management_version: 'v2',
      status: 'offline',
      ...rest,
      ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
      ...(configuration ? { configuration: JSON.stringify(configuration) } : {}),
      ...(data.status === 'online' ? { last_seen: new Date() } : {}),
      id,
    });
    return (await this.findById(id)) as Gateway;
  }

  /**
   * Idempotent insert of an unbound swap-candidate gateway row.
   * Returns `created: true` only when a new row was inserted.
   */
  async createUnboundSwapCandidateIfAbsent(params: {
    id: string;
    name: string;
    metadata?: Record<string, any>;
  }): Promise<{ created: boolean; gateway: Gateway | null }> {
    const existing = await this.findById(params.id);
    if (existing) {
      return { created: false, gateway: existing };
    }

    try {
      const gateway = await this.createWithId(params.id, {
        facility_id: null,
        name: params.name,
        status: 'online',
        metadata: params.metadata,
      });
      return { created: true, gateway };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { created: false, gateway: await this.findById(params.id) };
      }
      throw error;
    }
  }

  /**
   * Atomically bind a gateway as the facility's bound gateway for first-time install,
   * but only if the facility has no bound gateway yet. Inserts a new row when the GUID
   * is unknown, or binds an existing unbound row. If another gateway won the race (a
   * bound gateway already exists), returns `{ bound: false }` so the caller can fall
   * back to parking the connection as a swap candidate.
   */
  async createOrBindAsFirstGateway(params: {
    id: string;
    facilityId: string;
    /** @deprecated Ignored — bound name is resolved from the facility (unless operator-set). */
    name?: string;
    metadata?: Record<string, any>;
  }): Promise<{ bound: boolean; created: boolean; gateway: Gateway | null }> {
    const knex = this.db.connection;
    return await knex.transaction(async (trx) => {
      const existingBound = await trx('gateways')
        .where('facility_id', params.facilityId)
        .first();
      if (existingBound) {
        return { bound: false, created: false, gateway: null };
      }

      const existingRow = await trx('gateways').where('id', params.id).first();
      if (existingRow && existingRow.facility_id && existingRow.facility_id !== params.facilityId) {
        // Belongs to another facility — caller validates this earlier, guard anyway.
        return { bound: false, created: false, gateway: null };
      }

      const facility = await trx('facilities').where('id', params.facilityId).first();
      const displayName = resolveBoundGatewayDisplayName({
        facilityName: facility?.name,
        gatewayId: params.id,
        existingName: existingRow?.name,
        metadata: existingRow?.metadata,
      });
      const keepOperatorName =
        displayName === String(existingRow?.name ?? '').trim() &&
        Boolean(existingRow?.name);

      let created = false;
      if (existingRow) {
        const nextMetadata = keepOperatorName
          ? undefined
          : withOperatorSetGatewayDisplayName(existingRow.metadata, false);
        await trx('gateways').where('id', params.id).update({
          facility_id: params.facilityId,
          name: displayName,
          status: 'online',
          last_seen: new Date(),
          updated_at: new Date(),
          ...(nextMetadata
            ? { metadata: JSON.stringify(nextMetadata) }
            : {}),
        });
      } else {
        created = true;
        const cleanMeta = withOperatorSetGatewayDisplayName(
          {
            autoRegistered: true,
            ...(params.metadata || {}),
          },
          false,
        );
        await trx('gateways').insert({
          id: params.id,
          facility_id: params.facilityId,
          name: displayName,
          gateway_type: 'physical',
          key_management_version: 'v2',
          status: 'online',
          last_seen: new Date(),
          metadata: JSON.stringify(cleanMeta),
        });
      }
      const gateway = await trx('gateways').where('id', params.id).first();
      return { bound: true, created, gateway: gateway || null };
    });
  }

  async update(id: string, data: UpdateGatewayData): Promise<Gateway | null> {
    const knex = this.db.connection;
    
    // Filter out undefined and null values to prevent SQL syntax errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null)
    );
    if (cleanData.metadata && typeof cleanData.metadata === 'object') {
      cleanData.metadata = JSON.stringify(cleanData.metadata);
    }
    
    await knex('gateways').where('id', id).update({
      ...cleanData,
      updated_at: new Date()
    });
    return await this.findById(id);
  }

  async updateStatus(id: string, status: Gateway['status']): Promise<void> {
    const knex = this.db.connection;
    const updated_at = new Date();
    if (status === 'online') {
      await knex('gateways').where('id', id).update({
        status,
        last_seen: updated_at,
        updated_at,
      });
      return;
    }
    // Offline / error / maintenance: preserve last_seen (last known good contact).
    await knex('gateways').where('id', id).update({
      status,
      updated_at,
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
    const deleted = await knex.transaction(async (trx) => {
      // Gateway FK cascades wipe access_control_devices / blulok_devices; clear memberships first.
      const { DeviceGroupModel } = await import('@/models/device-group.model');
      await new DeviceGroupModel().removeMembershipsForGatewayDevices(id, trx);
      const count = await trx('gateways').where('id', id).del();
      return count as number;
    });
    return deleted > 0;
  }

  async getGatewayWithDevices(id: string): Promise<{
    gateway: Gateway;
    accessControlDevices: any[];
    blulokDevices: any[];
    inventoryDevices: any[];
  } | null> {
    const knex = this.db.connection;
    
    const gateway = await this.findById(id);
    if (!gateway) return null;

    const accessControlDevices = await knex('access_control_devices')
      .where('gateway_id', id)
      .orderBy('relay_channel');

    // Left join so gateway-synced devices not yet assigned to a unit (unit_id NULL)
    // are still included — e.g. in the recovery inventory snapshot.
    const blulokDevices = await knex('blulok_devices')
      .select('blulok_devices.*', 'units.unit_number', 'units.unit_type')
      .leftJoin('units', 'blulok_devices.unit_id', 'units.id')
      .where('blulok_devices.gateway_id', id)
      .orderBy('units.unit_number');

    const inventoryDevices = await knex('gateway_inventory_devices')
      .where('gateway_id', id)
      .orderBy('device_kind')
      .orderBy('device_serial');

    return {
      gateway,
      accessControlDevices,
      blulokDevices,
      inventoryDevices,
    };
  }

  /**
   * Create or re-bind a gateway via sticker ZTP claim.
   * - Empty facility → bind as the active facility gateway (`bound: true`).
   * - Facility already has a different bound gateway → persist unbound identity + intended
   *   facility metadata for swap-candidate AUTH (`bound: false`). Does not steal the live binding.
   */
  async claimViaZtp(params: {
    deviceId: string;
    facilityId: string;
    publicKey: string;
    claimedByUserId: string;
    name?: string;
  }): Promise<{ gateway: Gateway; created: boolean; bound: boolean }> {
    const knex = this.db.connection;

    return await knex.transaction(async (trx) => {
      const existingBound = await trx('gateways').where('facility_id', params.facilityId).first();
      const facilityAlreadyBound =
        Boolean(existingBound) && existingBound.id !== params.deviceId;

      const existing = await trx('gateways').where('id', params.deviceId).first();
      if (existing?.revoked_at) {
        const err = new Error('GATEWAY_REVOKED') as Error & { code: string };
        err.code = 'GATEWAY_REVOKED';
        throw err;
      }
      if (existing?.facility_id && existing.facility_id !== params.facilityId) {
        const err = new Error('ALREADY_CLAIMED') as Error & { code: string };
        err.code = 'ALREADY_CLAIMED';
        throw err;
      }
      // Idempotent: already bound to this facility with matching key
      if (existing?.facility_id === params.facilityId && existing.public_key) {
        if (existing.public_key !== params.publicKey) {
          const err = new Error('PUBLIC_KEY_MISMATCH') as Error & { code: string };
          err.code = 'PUBLIC_KEY_MISMATCH';
          throw err;
        }
        return { gateway: existing as Gateway, created: false, bound: true };
      }
      // Idempotent swap-prep: unbound with matching key + intended facility
      if (
        existing &&
        !existing.facility_id &&
        existing.public_key &&
        facilityAlreadyBound
      ) {
        if (existing.public_key !== params.publicKey) {
          const err = new Error('PUBLIC_KEY_MISMATCH') as Error & { code: string };
          err.code = 'PUBLIC_KEY_MISMATCH';
          throw err;
        }
        if (getZtpIntendedFacilityId(existing.metadata) === params.facilityId) {
          return { gateway: existing as Gateway, created: false, bound: false };
        }
      }
      if (existing?.public_key && existing.public_key !== params.publicKey) {
        const err = new Error('PUBLIC_KEY_MISMATCH') as Error & { code: string };
        err.code = 'PUBLIC_KEY_MISMATCH';
        throw err;
      }

      const facility = await trx('facilities').where('id', params.facilityId).first();
      const now = new Date();

      if (facilityAlreadyBound) {
        const displayName =
          params.name?.trim() ||
          existing?.name ||
          unboundGatewayDisplayName(params.deviceId);
        const metadata = withZtpIntendedFacilityId(existing?.metadata, params.facilityId);

        if (existing) {
          await trx('gateways').where('id', params.deviceId).update({
            facility_id: null,
            name: displayName,
            public_key: params.publicKey,
            claimed_by_user_id: params.claimedByUserId,
            claimed_at: now,
            released_at: null,
            status: 'offline',
            metadata: JSON.stringify(metadata),
            updated_at: now,
          });
          const gateway = await trx('gateways').where('id', params.deviceId).first();
          return { gateway: gateway as Gateway, created: false, bound: false };
        }

        await trx('gateways').insert({
          id: params.deviceId,
          facility_id: null,
          name: displayName,
          gateway_type: 'physical',
          key_management_version: 'v2',
          status: 'offline',
          public_key: params.publicKey,
          claimed_by_user_id: params.claimedByUserId,
          claimed_at: now,
          metadata: JSON.stringify(metadata),
        });
        const gateway = await trx('gateways').where('id', params.deviceId).first();
        return { gateway: gateway as Gateway, created: true, bound: false };
      }

      const displayName =
        params.name?.trim() ||
        resolveBoundGatewayDisplayName({
          facilityName: facility?.name,
          gatewayId: params.deviceId,
          existingName: existing?.name,
          metadata: existing?.metadata,
        });

      const metadata = withZtpIntendedFacilityId(existing?.metadata, params.facilityId);

      if (existing) {
        await trx('gateways').where('id', params.deviceId).update({
          facility_id: params.facilityId,
          name: displayName,
          public_key: params.publicKey,
          claimed_by_user_id: params.claimedByUserId,
          claimed_at: now,
          released_at: null,
          status: 'offline',
          metadata: JSON.stringify(metadata),
          updated_at: now,
        });
        const gateway = await trx('gateways').where('id', params.deviceId).first();
        return { gateway: gateway as Gateway, created: false, bound: true };
      }

      await trx('gateways').insert({
        id: params.deviceId,
        facility_id: params.facilityId,
        name: displayName,
        gateway_type: 'physical',
        key_management_version: 'v2',
        status: 'offline',
        public_key: params.publicKey,
        claimed_by_user_id: params.claimedByUserId,
        claimed_at: now,
        metadata: JSON.stringify(metadata),
      });
      const gateway = await trx('gateways').where('id', params.deviceId).first();
      return { gateway: gateway as Gateway, created: true, bound: true };
    });
  }

  async releaseZtpClaim(id: string): Promise<Gateway | null> {
    const knex = this.db.connection;
    const existing = await this.findById(id);
    if (!existing) return null;
    const now = new Date();
    const metadata = withoutZtpIntendedFacilityId(existing.metadata);
    await knex('gateways').where('id', id).update({
      facility_id: null,
      released_at: now,
      status: 'offline',
      metadata: JSON.stringify(metadata),
      updated_at: now,
    });
    return this.findById(id);
  }

  async revokeZtp(id: string): Promise<Gateway | null> {
    const knex = this.db.connection;
    const existing = await this.findById(id);
    if (!existing) return null;
    const now = new Date();
    const metadata = withoutZtpIntendedFacilityId(existing.metadata);
    await knex('gateways').where('id', id).update({
      facility_id: null,
      revoked_at: now,
      status: 'offline',
      metadata: JSON.stringify(metadata),
      updated_at: now,
    });
    return this.findById(id);
  }
}
