import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { GatewayModel } from '@/models/gateway.model';
import { GatewayInventorySnapshotModel } from '@/models/gateway-recovery.model';
import { getProvisioningStorageProvider } from '@/services/provisioning/provisioning-storage.factory';
import { logger } from '@/utils/logger';

import { NetworkInfraSyncKind, getGatewayDeviceKindDefinition } from '@/config/gateway-device-kinds';
import { DenylistSyncEntry, DenylistSyncService } from '@/services/denylist-sync.service';

export interface InventorySnapshotDevice {
  kind: 'lock' | 'access_control' | NetworkInfraSyncKind;
  device_id: string;
  serial: string;
  unit_id?: string | null;
  unit_number?: string | null;
  lock_number?: number | null;
  relay_channel?: number | null;
  lock_id?: string | null;
  state?: string | null;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  /** Active cloud denylist entries for operational devices (lock / access_control). */
  denylist?: DenylistSyncEntry[];
}

export interface InventorySnapshotPayload {
  schema_version: 1 | 2;
  facility_id: string;
  gateway_id: string;
  generated_at: string;
  devices: InventorySnapshotDevice[];
}

export class InventorySnapshotService {
  private static gatewayModel = new GatewayModel();
  private static snapshotModel = new GatewayInventorySnapshotModel();

  static buildSnapshotPayload(
    facilityId: string,
    gatewayId: string,
    blulokDevices: Array<Record<string, unknown>>,
    accessControlDevices: Array<Record<string, unknown>>,
    inventoryDevices: Array<Record<string, unknown>> = [],
  ): InventorySnapshotPayload {
    const devices: InventorySnapshotDevice[] = [];

    for (const row of blulokDevices) {
      devices.push({
        kind: 'lock',
        device_id: String(row.id),
        serial: String(row.device_serial || row.serial || ''),
        unit_id: (row.unit_id as string | null | undefined) ?? null,
        unit_number: (row.unit_number as string | null | undefined) ?? null,
        lock_number: typeof row.lock_number === 'number' ? row.lock_number : null,
        lock_id: String(row.id),
        properties: {
          lock_status: row.lock_status,
          firmware_version: row.firmware_version,
        },
      });
    }

    for (const row of accessControlDevices) {
      devices.push({
        kind: 'access_control',
        device_id: String(row.id),
        serial: String(row.device_serial || row.serial || ''),
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
        device_id: String(row.id),
        serial: String(row.device_serial || ''),
        state: row.state != null ? String(row.state) : null,
        firmware_version: row.firmware_version != null ? String(row.firmware_version) : null,
        info,
        properties: {
          metadata: row.metadata,
        },
      });
    }

    devices.sort((a, b) => {
      const keyA = `${a.kind}:${a.serial}`;
      const keyB = `${b.kind}:${b.serial}`;
      return keyA.localeCompare(keyB);
    });

    return {
      schema_version: 2,
      facility_id: facilityId,
      gateway_id: gatewayId,
      generated_at: new Date().toISOString(),
      devices,
    };
  }

  static async attachActiveDenylists(
    payload: InventorySnapshotPayload,
  ): Promise<InventorySnapshotPayload> {
    const operationalIds = payload.devices
      .filter((device) => device.kind === 'lock' || device.kind === 'access_control')
      .map((device) => device.device_id);
    const denylistByDevice = await DenylistSyncService.getDenylistsForDeviceIds(operationalIds);

    const devices = payload.devices.map((device) => {
      if (device.kind !== 'lock' && device.kind !== 'access_control') {
        return device;
      }
      const denylist = denylistByDevice.get(device.device_id) ?? [];
      return { ...device, denylist };
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

    const basePayload = this.buildSnapshotPayload(
      facilityId,
      targetGatewayId,
      withDevices.blulokDevices,
      withDevices.accessControlDevices,
      withDevices.inventoryDevices,
    );
    const payload = await this.attachActiveDenylists(basePayload);
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
    const basePayload = this.buildSnapshotPayload(
      facilityId,
      bound.id,
      withDevices.blulokDevices,
      withDevices.accessControlDevices,
      withDevices.inventoryDevices,
    );
    const payload = await this.attachActiveDenylists(basePayload);
    return payload.devices;
  }
}
