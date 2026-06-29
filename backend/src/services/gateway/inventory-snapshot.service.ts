import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { GatewayModel } from '@/models/gateway.model';
import { GatewayInventorySnapshotModel } from '@/models/gateway-recovery.model';
import { getProvisioningStorageProvider } from '@/services/provisioning/provisioning-storage.factory';
import { logger } from '@/utils/logger';

import { NetworkInfraSyncKind, getGatewayDeviceKindDefinition } from '@/config/gateway-device-kinds';
import { DenylistSyncEntry, DenylistSyncService } from '@/services/denylist-sync.service';
import { readBluLokLockNumber } from '@/utils/gateway-lock-inventory-map.utils';

export interface InventorySnapshotLockDevice {
  kind: 'lock';
  /** Gateway mesh identity (hardware serial — same as inventory sync `lock_id`). */
  lock_id: string;
  unit_id?: string | null;
  unit_number?: string | null;
  lock_number?: number | null;
  properties?: Record<string, unknown>;
  denylist?: DenylistSyncEntry[];
}

export interface InventorySnapshotAccessControlDevice {
  kind: 'access_control';
  /** Gateway mesh identity (hardware serial — same as inventory sync `access_id`). */
  access_id: string;
  relay_channel?: number | null;
  properties?: Record<string, unknown>;
  denylist?: DenylistSyncEntry[];
}

export interface InventorySnapshotInfraDevice {
  kind: NetworkInfraSyncKind;
  serial: string;
  state?: string | null;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export type InventorySnapshotDevice =
  | InventorySnapshotLockDevice
  | InventorySnapshotAccessControlDevice
  | InventorySnapshotInfraDevice;

export interface InventorySnapshotPayload {
  schema_version: 1 | 2;
  facility_id: string;
  gateway_id: string;
  generated_at: string;
  devices: InventorySnapshotDevice[];
}

/** Stable sort/display key for a snapshot device row. */
export function inventorySnapshotDeviceKey(device: InventorySnapshotDevice): string {
  if (device.kind === 'lock') return `lock:${device.lock_id}`;
  if (device.kind === 'access_control') {
    const relay = device.relay_channel ?? 1;
    return `access_control:${device.access_id}:${relay}`;
  }
  return `${device.kind}:${device.serial}`;
}

/** Human-readable identifier for operator preview UIs. */
export function inventorySnapshotDeviceLabel(device: InventorySnapshotDevice): string {
  if (device.kind === 'lock') return device.lock_id;
  if (device.kind === 'access_control') {
    const relay = device.relay_channel ?? 1;
    return relay === 1 ? device.access_id : `${device.access_id} (relay ${relay})`;
  }
  return device.serial;
}

type OperationalCloudIdKey = `lock:${string}` | `access_control:${string}:${number}`;

export class InventorySnapshotService {
  private static gatewayModel = new GatewayModel();
  private static snapshotModel = new GatewayInventorySnapshotModel();

  static buildSnapshotPayload(
    facilityId: string,
    gatewayId: string,
    blulokDevices: Array<Record<string, unknown>>,
    accessControlDevices: Array<Record<string, unknown>>,
    inventoryDevices: Array<Record<string, unknown>> = [],
  ): { payload: InventorySnapshotPayload; operationalCloudIds: Map<OperationalCloudIdKey, string> } {
    const devices: InventorySnapshotDevice[] = [];
    const operationalCloudIds = new Map<OperationalCloudIdKey, string>();

    for (const row of blulokDevices) {
      const lockId = String(row.device_serial || row.serial || '').trim();
      const lockNumber =
        readBluLokLockNumber({ device_settings: row.device_settings as Record<string, unknown> | null | undefined })
        ?? null;

      if (lockId) {
        operationalCloudIds.set(`lock:${lockId}`, String(row.id));
      }

      devices.push({
        kind: 'lock',
        lock_id: lockId,
        unit_id: (row.unit_id as string | null | undefined) ?? null,
        unit_number: (row.unit_number as string | null | undefined) ?? null,
        lock_number: lockNumber,
        properties: {
          lock_status: row.lock_status,
          firmware_version: row.firmware_version,
        },
      });
    }

    for (const row of accessControlDevices) {
      const accessId = String(row.device_serial || row.serial || '').trim();
      const relayChannel = typeof row.relay_channel === 'number' ? row.relay_channel : 1;
      if (accessId) {
        operationalCloudIds.set(`access_control:${accessId}:${relayChannel}`, String(row.id));
      }

      devices.push({
        kind: 'access_control',
        access_id: accessId,
        relay_channel: typeof row.relay_channel === 'number' ? row.relay_channel : null,
        properties: {
          device_name: row.device_name,
          firmware_version: row.firmware_version,
        },
      });
    }

    for (const row of inventoryDevices) {
      const kind = String(row.device_kind);
      const kindDef = getGatewayDeviceKindDefinition(kind);
      if (!kindDef?.includedInRecoverySnapshot) {
        continue;
      }
      const info =
        row.info && typeof row.info === 'object' && !Array.isArray(row.info)
          ? (row.info as Record<string, unknown>)
          : undefined;
      devices.push({
        kind: String(row.device_kind) as NetworkInfraSyncKind,
        serial: String(row.device_serial || ''),
        state: row.state != null ? String(row.state) : null,
        firmware_version: row.firmware_version != null ? String(row.firmware_version) : null,
        info,
        properties: {
          metadata: row.metadata,
        },
      });
    }

    devices.sort((a, b) => inventorySnapshotDeviceKey(a).localeCompare(inventorySnapshotDeviceKey(b)));

    return {
      payload: {
        schema_version: 2,
        facility_id: facilityId,
        gateway_id: gatewayId,
        generated_at: new Date().toISOString(),
        devices,
      },
      operationalCloudIds,
    };
  }

  static async attachActiveDenylists(
    payload: InventorySnapshotPayload,
    operationalCloudIds: Map<OperationalCloudIdKey, string>,
  ): Promise<InventorySnapshotPayload> {
    const cloudIds = [...new Set(operationalCloudIds.values())];
    const denylistByDevice = await DenylistSyncService.getDenylistsForDeviceIds(cloudIds);

    const devices = payload.devices.map((device) => {
      if (device.kind === 'lock') {
        const cloudId = operationalCloudIds.get(`lock:${device.lock_id}`);
        const denylist = cloudId ? (denylistByDevice.get(cloudId) ?? []) : [];
        return { ...device, denylist };
      }
      if (device.kind === 'access_control') {
        const relay = device.relay_channel ?? 1;
        const cloudId = operationalCloudIds.get(`access_control:${device.access_id}:${relay}`);
        const denylist = cloudId ? (denylistByDevice.get(cloudId) ?? []) : [];
        return { ...device, denylist };
      }
      return device;
    });

    return { ...payload, devices };
  }

  static serializeDeterministic(payload: InventorySnapshotPayload): string {
    const sortDeep = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(sortDeep);
      }
      if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(record).sort()) {
          sorted[key] = sortDeep(record[key]);
        }
        return sorted;
      }
      return value;
    };
    return JSON.stringify(sortDeep(payload));
  }

  static async buildAndStoreForFacility(
    facilityId: string,
    targetGatewayId: string,
  ): Promise<{ snapshotId: string; sha256: string; sizeBytes: number; deviceCount: number; storagePath: string }> {
    const bound = await this.gatewayModel.findByFacilityId(facilityId);
    const sourceGatewayId = bound?.id ?? targetGatewayId;
    const withDevices = await this.gatewayModel.getGatewayWithDevices(sourceGatewayId);
    if (!withDevices) {
      throw new Error('Gateway not found for inventory snapshot');
    }

    const { payload: basePayload, operationalCloudIds } = this.buildSnapshotPayload(
      facilityId,
      targetGatewayId,
      withDevices.blulokDevices,
      withDevices.accessControlDevices,
      withDevices.inventoryDevices,
    );
    const payload = await this.attachActiveDenylists(basePayload, operationalCloudIds);
    const json = this.serializeDeterministic(payload);
    const binary = Buffer.from(json, 'utf8');
    const sha256 = crypto.createHash('sha256').update(binary).digest('hex');
    const snapshotId = uuidv4();
    const storagePath = `provisioning/inventory-snapshots/${targetGatewayId}/${snapshotId}.json`;

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    await storage.writePreparedUpload(storagePath, binary);

    await this.snapshotModel.create({
      id: snapshotId,
      gateway_id: targetGatewayId,
      facility_id: facilityId,
      sha256_hash: sha256,
      size_bytes: binary.length,
      storage_path: storagePath,
      device_count: payload.devices.length,
    });

    logger.info(`Inventory snapshot stored snapshotId=${snapshotId} facility=${facilityId} devices=${payload.devices.length}`);

    return {
      snapshotId,
      sha256,
      sizeBytes: binary.length,
      deviceCount: payload.devices.length,
      storagePath,
    };
  }

  static async loadSnapshotBinary(snapshotId: string): Promise<{ binary: Buffer; snapshot: NonNullable<Awaited<ReturnType<GatewayInventorySnapshotModel['findById']>>> }> {
    const snapshot = await this.snapshotModel.findById(snapshotId);
    if (!snapshot) {
      throw new Error('Inventory snapshot not found');
    }
    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    const binary = await storage.download(snapshot.storage_path);
    const hash = crypto.createHash('sha256').update(binary).digest('hex');
    if (hash !== snapshot.sha256_hash) {
      throw new Error(`Inventory snapshot SHA-256 mismatch: expected ${snapshot.sha256_hash}, got ${hash}`);
    }
    return { binary, snapshot };
  }

  static async previewForFacility(facilityId: string): Promise<InventorySnapshotDevice[]> {
    const bound = await this.gatewayModel.findByFacilityId(facilityId);
    if (!bound) return [];
    const withDevices = await this.gatewayModel.getGatewayWithDevices(bound.id);
    if (!withDevices) return [];
    const { payload: basePayload, operationalCloudIds } = this.buildSnapshotPayload(
      facilityId,
      bound.id,
      withDevices.blulokDevices,
      withDevices.accessControlDevices,
      withDevices.inventoryDevices,
    );
    const payload = await this.attachActiveDenylists(basePayload, operationalCloudIds);
    return payload.devices;
  }
}
