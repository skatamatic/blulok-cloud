import { v4 as uuidv4 } from 'uuid';
import { NetworkInfraSyncKind } from '@/config/gateway-device-kinds';
import { DatabaseService } from '@/services/database.service';

export interface GatewayInventoryDeviceRow {
  id: string;
  gateway_id: string;
  device_kind: NetworkInfraSyncKind;
  device_serial: string;
  state: string | null;
  firmware_version: string | null;
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  last_seen: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface GatewayInventoryDeviceListRow extends GatewayInventoryDeviceRow {
  facility_id: string | null;
  facility_name: string | null;
  gateway_name: string | null;
}

export interface GatewayInventoryDeviceFilters {
  facility_id?: string;
  facility_ids?: string[];
  gateway_id?: string;
  device_kind?: NetworkInfraSyncKind;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'device_serial' | 'device_kind' | 'status' | 'facility_name' | 'gateway_name' | 'last_seen' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UpsertGatewayInventoryDeviceInput {
  gatewayId: string;
  deviceKind: NetworkInfraSyncKind;
  deviceSerial: string;
  state?: string | null;
  firmwareVersion?: string | null;
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastSeen?: Date | null | undefined;
}

const KNOWN_METADATA_KEYS = new Set([
  'kind',
  'serial',
  'state',
  'firmware_version',
  'info',
  'last_seen',
]);

export class GatewayInventoryDeviceModel {
  private readonly db = DatabaseService.getInstance();

  private get knex() {
    return this.db.connection;
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  private safeParseJson(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  private buildListQuery(filters: GatewayInventoryDeviceFilters = {}) {
    let query = this.knex('gateway_inventory_devices')
      .select(
        'gateway_inventory_devices.*',
        'gateways.facility_id as facility_id',
        'facilities.name as facility_name',
        'gateways.name as gateway_name',
      )
      .join('gateways', 'gateway_inventory_devices.gateway_id', 'gateways.id')
      .leftJoin('facilities', 'gateways.facility_id', 'facilities.id');

    if (filters.facility_id) {
      query = query.where('gateways.facility_id', filters.facility_id);
    } else if (filters.facility_ids && filters.facility_ids.length > 0) {
      query = query.whereIn('gateways.facility_id', filters.facility_ids);
    }

    if (filters.gateway_id) {
      query = query.where('gateway_inventory_devices.gateway_id', filters.gateway_id);
    }

    if (filters.device_kind) {
      query = query.where('gateway_inventory_devices.device_kind', filters.device_kind);
    }

    if (filters.search) {
      const pattern = `%${this.escapeLikePattern(filters.search.trim())}%`;
      query = query.where((builder) => {
        builder
          .where('gateway_inventory_devices.device_serial', 'like', pattern)
          .orWhere('gateway_inventory_devices.device_kind', 'like', pattern);
      });
    }

    if (filters.status) {
      const status = filters.status.trim().toLowerCase();
      if (status === 'online') {
        query = query.whereIn('gateway_inventory_devices.state', ['healthy', 'ok', 'online', 'Healthy', 'OK', 'Online']);
      } else if (status === 'error') {
        query = query.whereIn('gateway_inventory_devices.state', ['error', 'fault', 'Error', 'Fault']);
      } else {
        query = query.where('gateway_inventory_devices.state', filters.status);
      }
    }

    return query;
  }

  async findByGatewayId(gatewayId: string): Promise<GatewayInventoryDeviceRow[]> {
    const rows = await this.knex('gateway_inventory_devices')
      .where('gateway_id', gatewayId)
      .orderBy('device_kind')
      .orderBy('device_serial');
    return rows.map((row) => this.mapRow(row));
  }

  async findByGatewayKindAndSerial(
    gatewayId: string,
    deviceKind: NetworkInfraSyncKind,
    deviceSerial: string,
  ): Promise<GatewayInventoryDeviceRow | null> {
    const row = await this.knex('gateway_inventory_devices')
      .where({
        gateway_id: gatewayId,
        device_kind: deviceKind,
        device_serial: deviceSerial,
      })
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<GatewayInventoryDeviceRow | null> {
    const row = await this.knex('gateway_inventory_devices').where('id', id).first();
    return row ? this.mapRow(row) : null;
  }

  async findByIdWithContext(id: string): Promise<GatewayInventoryDeviceListRow | null> {
    const row = await this.buildListQuery().where('gateway_inventory_devices.id', id).first();
    return row ? this.mapListRow(row) : null;
  }

  async findDevices(filters: GatewayInventoryDeviceFilters = {}): Promise<GatewayInventoryDeviceListRow[]> {
    let query = this.buildListQuery(filters);
    const sortBy = filters.sortBy ?? 'device_serial';
    const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc';

    const sortColumnMap: Record<string, string> = {
      name: 'gateway_inventory_devices.device_serial',
      device_serial: 'gateway_inventory_devices.device_serial',
      device_kind: 'gateway_inventory_devices.device_kind',
      status: 'gateway_inventory_devices.state',
      facility_name: 'facilities.name',
      gateway_name: 'gateways.name',
      last_seen: 'gateway_inventory_devices.last_seen',
      created_at: 'gateway_inventory_devices.created_at',
    };

    query = query.orderBy(sortColumnMap[sortBy] ?? 'gateway_inventory_devices.device_serial', sortOrder);

    if (typeof filters.offset === 'number') {
      query = query.offset(filters.offset);
    }
    if (typeof filters.limit === 'number') {
      query = query.limit(filters.limit);
    }

    const rows = await query;
    return rows.map((row) => this.mapListRow(row));
  }

  async countDevices(filters: GatewayInventoryDeviceFilters = {}): Promise<number> {
    const result = await this.buildListQuery(filters).count({ count: '*' }).first();
    return Number(result?.count ?? 0);
  }

  async upsert(input: UpsertGatewayInventoryDeviceInput): Promise<GatewayInventoryDeviceRow> {
    const now = new Date();
    const existing = await this.knex('gateway_inventory_devices')
      .where({
        gateway_id: input.gatewayId,
        device_kind: input.deviceKind,
        device_serial: input.deviceSerial,
      })
      .first();

    const payload: Record<string, unknown> = {
      state: input.state ?? null,
      firmware_version: input.firmwareVersion ?? null,
      info: JSON.stringify(input.info ?? {}),
      metadata: JSON.stringify(input.metadata ?? {}),
      updated_at: now,
    };

    if (input.lastSeen !== undefined) {
      payload.last_seen = input.lastSeen;
    } else if (!existing) {
      payload.last_seen = null;
    }

    if (existing) {
      await this.knex('gateway_inventory_devices').where('id', existing.id).update(payload);
      return (await this.findById(existing.id))!;
    }

    const id = uuidv4();
    await this.knex('gateway_inventory_devices').insert({
      id,
      gateway_id: input.gatewayId,
      device_kind: input.deviceKind,
      device_serial: input.deviceSerial,
      ...payload,
      created_at: now,
    });

    return (await this.findById(id))!;
  }

  async patchByGatewayKindAndSerial(
    gatewayId: string,
    deviceKind: NetworkInfraSyncKind,
    deviceSerial: string,
    patch: {
      state?: string | null;
      firmwareVersion?: string | null;
      info?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      lastSeen?: Date;
    },
  ): Promise<GatewayInventoryDeviceRow | null> {
    const existing = await this.findByGatewayKindAndSerial(gatewayId, deviceKind, deviceSerial);
    if (!existing) {
      return null;
    }

    const payload: Record<string, unknown> = { updated_at: new Date() };

    if (patch.state !== undefined) {
      payload.state = patch.state;
    }
    if (patch.firmwareVersion !== undefined) {
      payload.firmware_version = patch.firmwareVersion;
    }
    if (patch.info !== undefined) {
      payload.info = JSON.stringify(patch.info);
    }
    if (patch.metadata !== undefined) {
      payload.metadata = JSON.stringify({
        ...existing.metadata,
        ...patch.metadata,
      });
    }
    if (patch.lastSeen !== undefined) {
      payload.last_seen = patch.lastSeen;
    }

    if (Object.keys(payload).length <= 1) {
      return existing;
    }

    await this.knex('gateway_inventory_devices').where('id', existing.id).update(payload);
    return this.findById(existing.id);
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.knex('gateway_inventory_devices').where('id', id).del();
    return deleted > 0;
  }

  async rebindGatewayId(oldGatewayId: string, newGatewayId: string): Promise<number> {
    return this.knex('gateway_inventory_devices')
      .where('gateway_id', oldGatewayId)
      .update({ gateway_id: newGatewayId, updated_at: new Date() });
  }

  extractMetadataFromPayload(item: Record<string, unknown>): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (!KNOWN_METADATA_KEYS.has(key)) {
        metadata[key] = value;
      }
    }
    return metadata;
  }

  private mapRow(row: Record<string, unknown>): GatewayInventoryDeviceRow {
    return {
      id: String(row.id),
      gateway_id: String(row.gateway_id),
      device_kind: row.device_kind as NetworkInfraSyncKind,
      device_serial: String(row.device_serial),
      state: row.state != null ? String(row.state) : null,
      firmware_version: row.firmware_version != null ? String(row.firmware_version) : null,
      info: this.safeParseJson(row.info),
      metadata: this.safeParseJson(row.metadata),
      last_seen: row.last_seen ? new Date(row.last_seen as string | Date) : null,
      created_at: new Date(row.created_at as string | Date),
      updated_at: new Date(row.updated_at as string | Date),
    };
  }

  private mapListRow(row: Record<string, unknown>): GatewayInventoryDeviceListRow {
    return {
      ...this.mapRow(row),
      facility_id: row.facility_id != null ? String(row.facility_id) : null,
      facility_name: row.facility_name != null ? String(row.facility_name) : null,
      gateway_name: row.gateway_name != null ? String(row.gateway_name) : null,
    };
  }
}
