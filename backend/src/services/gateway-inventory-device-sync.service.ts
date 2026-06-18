import {
  isNetworkInfraSyncKind,
  mapInfraStateToStatus,
  type NetworkInfraSyncKind,
} from '@/config/gateway-device-kinds';
import {
  GatewayInventoryDeviceModel,
  type GatewayInventoryDeviceListRow,
  type GatewayInventoryDeviceFilters,
} from '@/models/gateway-inventory-device.model';
import { GatewayModel } from '@/models/gateway.model';
import type { InventorySyncResult, StateUpdateResult } from '@/services/device-sync.service';
import type { DeviceSyncLogEntry } from '@/types/gateway-device-sync.types';
import type { NetworkInfraInventoryItem, NetworkInfraStateUpdate } from '@/utils/gateway-sync.utils';
import {
  formatNetworkInfraStateKey,
  isEmptyNetworkInfraStatePatch,
  mapNetworkInfraStateUpdateToPatch,
} from '@/utils/gateway-network-infra-state-map.utils';
import {
  normalizeNetworkInfraSortKey,
  sortMergedDeviceList,
} from '@/utils/merged-device-list.utils';

export interface NetworkInfraDeviceListItem {
  id: string;
  device_category: 'network_infra';
  device_kind: NetworkInfraSyncKind | 'gateway';
  name: string;
  device_serial: string;
  status: string;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  facility_id: string | null;
  facility_name: string | null;
  gateway_id: string;
  gateway_name: string | null;
  last_seen?: string | null;
  deletable: boolean;
}

function extractSerial(item: Record<string, unknown>): string {
  const raw = item.serial;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Network infra item must include serial');
  }
  return raw.trim();
}

function extractKind(item: Record<string, unknown>): NetworkInfraSyncKind {
  const kind = item.kind;
  if (typeof kind !== 'string' || !isNetworkInfraSyncKind(kind)) {
    throw new Error('Network infra item must include kind ("bridge" or "friend_node")');
  }
  return kind;
}

export class GatewayInventoryDeviceSyncService {
  private static instance: GatewayInventoryDeviceSyncService;
  private readonly model = new GatewayInventoryDeviceModel();
  private readonly gatewayModel = new GatewayModel();

  public static getInstance(): GatewayInventoryDeviceSyncService {
    if (!this.instance) {
      this.instance = new GatewayInventoryDeviceSyncService();
    }
    return this.instance;
  }

  public async syncNetworkInfraInventory(
    gatewayId: string,
    devices: NetworkInfraInventoryItem[],
  ): Promise<InventorySyncResult> {
    const result: InventorySyncResult = {
      added: 0,
      removed: 0,
      unchanged: 0,
      updated: 0,
      errors: [],
      entries: [],
    };

    const gateway = await this.gatewayModel.findById(gatewayId);
    const facilityId = gateway?.facility_id ?? null;

    const incomingMap = new Map<string, NetworkInfraInventoryItem>();
    for (const device of devices) {
      try {
        const kind = extractKind(device as unknown as Record<string, unknown>);
        const serial = extractSerial(device as unknown as Record<string, unknown>);
        incomingMap.set(`${kind}:${serial}`, device);
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const existingDevices = await this.model.findByGatewayId(gatewayId);

    for (const device of existingDevices) {
      const key = `${device.device_kind}:${device.device_serial}`;
      if (incomingMap.has(key)) {
        continue;
      }

      try {
        const { DevicesService } = await import('@/services/devices.service');
        await DevicesService.getInstance().deleteNetworkInfraFromInventory(device.id, {
          source: 'gateway_sync',
        });
        result.removed++;
        result.entries!.push({
          action: 'removed',
          device_kind: device.device_kind,
          identifier: key,
          label: device.device_serial,
          reason: 'Omitted from gateway inventory (sync-managed)',
        });
      } catch (err) {
        result.errors.push(
          `Failed to remove network infra ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const refreshedExisting = await this.model.findByGatewayId(gatewayId);
    const existingMap = new Map(
      refreshedExisting.map((device) => [`${device.device_kind}:${device.device_serial}`, device]),
    );

    for (const [key, item] of incomingMap.entries()) {
      try {
        const kind = extractKind(item as unknown as Record<string, unknown>);
        const serial = extractSerial(item as unknown as Record<string, unknown>);
        const metadata = this.model.extractMetadataFromPayload(item as unknown as Record<string, unknown>);
        const explicitLastSeen = item.last_seen
          ? new Date(item.last_seen as string | Date)
          : undefined;
        const payload = {
          gatewayId,
          deviceKind: kind,
          deviceSerial: serial,
          state: typeof item.state === 'string' ? item.state : null,
          firmwareVersion: typeof item.firmware_version === 'string' ? item.firmware_version : null,
          info: item.info && typeof item.info === 'object' ? item.info : {},
          metadata,
          ...(explicitLastSeen !== undefined ? { lastSeen: explicitLastSeen } : {}),
        };

        const existing = existingMap.get(key);
        if (!existing) {
          await this.model.upsert(payload);
          result.added++;
          result.entries!.push({
            action: 'added',
            device_kind: kind,
            identifier: key,
            label: serial,
          });
          continue;
        }

        const lastSeenChanged =
          explicitLastSeen !== undefined &&
          existing.last_seen?.getTime() !== explicitLastSeen.getTime();
        const changed =
          existing.state !== payload.state ||
          existing.firmware_version !== payload.firmwareVersion ||
          JSON.stringify(existing.info) !== JSON.stringify(payload.info) ||
          JSON.stringify(existing.metadata) !== JSON.stringify(payload.metadata) ||
          lastSeenChanged;

        await this.model.upsert(payload);
        if (changed) {
          result.updated = (result.updated ?? 0) + 1;
          result.entries!.push({
            action: 'updated',
            device_kind: kind,
            identifier: key,
            label: serial,
          });
        } else {
          result.unchanged++;
          result.entries!.push({
            action: 'unchanged',
            device_kind: kind,
            identifier: key,
            label: serial,
          });
        }
      } catch (err) {
        result.errors.push(
          `Failed to sync network infra ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (facilityId) {
      const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
      const deletionOutbox = DeviceDeletionOutboxService.getInstance();
      for (const item of incomingMap.values()) {
        try {
          const kind = extractKind(item as unknown as Record<string, unknown>);
          const serial = extractSerial(item as unknown as Record<string, unknown>);
          await deletionOutbox.cancelForNetworkInfra(facilityId, kind, serial);
        } catch {
          // skip invalid keys
        }
      }
    }

    return result;
  }

  /**
   * Partial state/telemetry for sync-managed bridge and friend_node rows.
   * Does not add or remove inventory membership — use inventory sync for that.
   */
  public async updateNetworkInfraDeviceStates(
    gatewayId: string,
    updates: NetworkInfraStateUpdate[],
  ): Promise<StateUpdateResult> {
    const result: StateUpdateResult = {
      updated: 0,
      not_found: [],
      errors: [],
    };

    for (const update of updates) {
      let kind: NetworkInfraSyncKind;
      let serial: string;
      try {
        kind = extractKind(update as unknown as Record<string, unknown>);
        serial = extractSerial(update as unknown as Record<string, unknown>);
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
        continue;
      }

      const key = formatNetworkInfraStateKey(kind, serial);

      try {
        const patch = mapNetworkInfraStateUpdateToPatch(update);
        if (isEmptyNetworkInfraStatePatch(patch)) {
          continue;
        }

        const updated = await this.model.patchByGatewayKindAndSerial(
          gatewayId,
          kind,
          serial,
          patch,
        );

        if (updated) {
          result.updated++;
        } else {
          result.not_found.push(key);
        }
      } catch (err) {
        result.errors.push(
          `Failed to update network infra ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return result;
  }

  public async applyGatewayInventoryUpdate(
    gatewayId: string,
    item: Record<string, unknown>,
  ): Promise<void> {
    const updates: Record<string, unknown> = {};

    if (typeof item.firmware_version === 'string') {
      updates.firmware_version = item.firmware_version;
    }

    if (typeof item.serial === 'string' && item.serial.trim().length > 0) {
      updates.mac_address = item.serial.trim();
    }

    if (typeof item.state === 'string') {
      const mapped = mapInfraStateToStatus(item.state);
      if (mapped === 'online' || mapped === 'offline' || mapped === 'error' || mapped === 'maintenance') {
        updates.status = mapped;
      }
    }

    if (item.info && typeof item.info === 'object') {
      const gateway = await this.gatewayModel.findById(gatewayId);
      let existingMetadata: Record<string, unknown> = {};
      if (gateway?.metadata) {
        if (typeof gateway.metadata === 'string') {
          try {
            existingMetadata = JSON.parse(gateway.metadata) as Record<string, unknown>;
          } catch {
            existingMetadata = {};
          }
        } else if (typeof gateway.metadata === 'object' && !Array.isArray(gateway.metadata)) {
          existingMetadata = gateway.metadata as Record<string, unknown>;
        }
      }
      updates.metadata = JSON.stringify({
        ...existingMetadata,
        inventory_info: item.info,
      });
    }

    if (item.last_seen) {
      updates.last_seen = new Date(item.last_seen as string | Date);
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    updates.updated_at = new Date();
    await this.gatewayModel.update(gatewayId, updates as Parameters<GatewayModel['update']>[1]);
  }

  public mapInfraRowToListItem(row: GatewayInventoryDeviceListRow): NetworkInfraDeviceListItem {
    return {
      id: row.id,
      device_category: 'network_infra',
      device_kind: row.device_kind,
      name: row.device_serial,
      device_serial: row.device_serial,
      status: mapInfraStateToStatus(row.state),
      firmware_version: row.firmware_version,
      info: row.info,
      facility_id: row.facility_id,
      facility_name: row.facility_name,
      gateway_id: row.gateway_id,
      gateway_name: row.gateway_name,
      last_seen: row.last_seen?.toISOString() ?? null,
      deletable: true,
    };
  }

  public mapFacilityGatewayToListItem(gateway: {
    id: string;
    name: string;
    firmware_version?: string | null;
    status: string;
    mac_address?: string | null;
    metadata?: Record<string, unknown> | null;
    last_seen?: Date | null;
    facility_id?: string | null;
    facility_name?: string | null;
  }): NetworkInfraDeviceListItem {
    const metadata = gateway.metadata && typeof gateway.metadata === 'object' ? gateway.metadata : {};
    const inventoryInfo =
      metadata.inventory_info && typeof metadata.inventory_info === 'object'
        ? (metadata.inventory_info as Record<string, unknown>)
        : undefined;

    return {
      id: gateway.id,
      device_category: 'network_infra',
      device_kind: 'gateway',
      name: gateway.name,
      device_serial: gateway.mac_address || gateway.id,
      status: gateway.status,
      firmware_version: gateway.firmware_version ?? null,
      info: inventoryInfo,
      facility_id: gateway.facility_id ?? null,
      facility_name: gateway.facility_name ?? null,
      gateway_id: gateway.id,
      gateway_name: gateway.name,
      last_seen: gateway.last_seen?.toISOString() ?? null,
      deletable: false,
    };
  }

  public async listNetworkInfraDevices(
    filters: GatewayInventoryDeviceFilters = {},
  ): Promise<{ devices: NetworkInfraDeviceListItem[]; total: number }> {
    const infraRows = await this.model.findDevices(filters);
    const infraDevices = infraRows.map((row) => this.mapInfraRowToListItem(row));

    const gatewayRows = await this.gatewayModel.findBoundGatewaysWithContext({
      facility_id: filters.facility_id,
      facility_ids: filters.facility_ids,
      gateway_id: filters.gateway_id,
      search: filters.search,
      status: filters.status,
    });
    const gatewayDevices = gatewayRows.map((row) =>
      this.mapFacilityGatewayToListItem({
        id: String(row.id),
        name: String(row.name),
        firmware_version: row.firmware_version ?? null,
        status: String(row.status),
        mac_address: row.mac_address ?? null,
        metadata: row.metadata,
        last_seen: row.last_seen ?? null,
        facility_id: row.facility_id ?? null,
        facility_name: row.facility_name ?? null,
      }),
    );

    const merged = [...gatewayDevices, ...infraDevices] as unknown as Record<string, unknown>[];
    const total = merged.length;

    const sortKey = normalizeNetworkInfraSortKey(filters.sortBy ?? 'name');
    const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc';
    sortMergedDeviceList(merged, sortKey, sortOrder);

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? merged.length;
    return {
      devices: merged.slice(offset, offset + limit) as unknown as NetworkInfraDeviceListItem[],
      total,
    };
  }
}

export type { DeviceSyncLogEntry };
