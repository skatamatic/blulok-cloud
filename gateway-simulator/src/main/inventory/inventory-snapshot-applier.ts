import type {
  AccessControlInventoryItem,
  BridgeInventoryItem,
  DeviceInventoryItem,
  FriendNodeInventoryItem,
  LockInventoryItem,
  LockState,
} from '@protocol/device-kinds';
import { deviceKey } from '../devices/IDeviceModel';

export type CloudInventorySnapshotLockDevice = {
  kind: 'lock';
  lock_id: string;
  unit_id?: string | null;
  unit_number?: string | null;
  lock_number?: number | null;
  state?: string | null;
  firmware_version?: string | null;
  properties?: Record<string, unknown>;
  denylist?: Array<{ sub: string; exp?: number }>;
};

export type CloudInventorySnapshotAccessControlDevice = {
  kind: 'access_control';
  access_id: string;
  relay_channel?: number | null;
  firmware_version?: string | null;
  properties?: Record<string, unknown>;
  denylist?: Array<{ sub: string; exp?: number }>;
};

export type CloudInventorySnapshotInfraDevice = {
  kind: 'bridge' | 'friend_node';
  serial: string;
  state?: string | null;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  properties?: Record<string, unknown>;
};

export type CloudInventorySnapshotDevice =
  | CloudInventorySnapshotLockDevice
  | CloudInventorySnapshotAccessControlDevice
  | CloudInventorySnapshotInfraDevice;

export type CloudInventorySnapshotPayload = {
  schema_version?: number;
  facility_id: string;
  gateway_id: string;
  generated_at?: string;
  devices: CloudInventorySnapshotDevice[];
};

type SnapshotRow = CloudInventorySnapshotDevice & { kind: string };

function readFirmwareVersion(row: {
  firmware_version?: string | null;
  properties?: Record<string, unknown>;
}): string | undefined {
  if (row.firmware_version?.trim()) return row.firmware_version.trim();
  const fromProps = row.properties?.firmware_version;
  if (typeof fromProps === 'string' && fromProps.trim()) return fromProps.trim();
  return undefined;
}

function mapLock(row: CloudInventorySnapshotLockDevice, now: string): LockInventoryItem {
  const lockId = String(row.lock_id || '').trim();
  if (!lockId) throw new Error('Inventory snapshot lock missing lock_id');

  const rawState = row.state?.toUpperCase();
  const state: LockState | undefined =
    rawState === 'CLOSED' || rawState === 'OPENED' || rawState === 'ERROR' || rawState === 'UNKNOWN'
      ? rawState
      : undefined;

  return {
    kind: 'lock',
    lock_id: lockId,
    lock_number: typeof row.lock_number === 'number' ? row.lock_number : undefined,
    state: state ?? 'CLOSED',
    locked: true,
    firmware_version: readFirmwareVersion(row),
    online: true,
    last_seen: now,
  };
}

function mapAccessControl(row: CloudInventorySnapshotAccessControlDevice, now: string): AccessControlInventoryItem {
  const accessId = String(row.access_id || '').trim();
  if (!accessId) throw new Error('Inventory snapshot access_control missing access_id');

  return {
    kind: 'access_control',
    access_id: accessId,
    relay_channel: typeof row.relay_channel === 'number' ? row.relay_channel : undefined,
    device_type: 'gate',
    locked: true,
    firmware_version: readFirmwareVersion(row),
    online: true,
    last_seen: now,
  };
}

function mapBridge(row: CloudInventorySnapshotInfraDevice, now: string): BridgeInventoryItem {
  const serial = String(row.serial || '').trim();
  if (!serial) throw new Error('Inventory snapshot bridge missing serial');

  return {
    kind: 'bridge',
    serial,
    state: row.state ?? 'healthy',
    firmware_version: readFirmwareVersion(row),
    info: row.info,
    online: true,
    last_seen: now,
  };
}

function mapFriendNode(row: CloudInventorySnapshotInfraDevice, now: string): FriendNodeInventoryItem {
  const serial = String(row.serial || '').trim();
  if (!serial) throw new Error('Inventory snapshot friend_node missing serial');

  return {
    kind: 'friend_node',
    serial,
    state: row.state ?? 'healthy',
    firmware_version: readFirmwareVersion(row),
    info: row.info,
    online: true,
    last_seen: now,
  };
}

export function parseInventorySnapshotPayload(binary: Buffer): CloudInventorySnapshotPayload {
  const parsed = JSON.parse(binary.toString('utf8')) as CloudInventorySnapshotPayload;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Inventory snapshot is not a JSON object');
  }
  if (!parsed.facility_id || !parsed.gateway_id) {
    throw new Error('Inventory snapshot missing facility_id or gateway_id');
  }
  if (!Array.isArray(parsed.devices)) {
    throw new Error('Inventory snapshot devices must be an array');
  }
  return parsed;
}

function mergeInventoryItem(
  incoming: DeviceInventoryItem,
  existingItems: DeviceInventoryItem[],
): DeviceInventoryItem {
  const key = deviceKey(incoming);
  const prior = existingItems.find((item) => deviceKey(item) === key);
  if (!prior) return incoming;
  return { ...prior, ...incoming } as DeviceInventoryItem;
}

export type MappedSnapshotDevice = {
  item: DeviceInventoryItem;
  denylist?: Array<{ sub: string; exp?: number }>;
};

export function mapSnapshotToInventoryItems(
  payload: CloudInventorySnapshotPayload,
  existingItems: DeviceInventoryItem[] = [],
): MappedSnapshotDevice[] {
  const now = new Date().toISOString();
  const mapped: MappedSnapshotDevice[] = [];

  for (const row of payload.devices as SnapshotRow[]) {
    switch (row.kind) {
      case 'lock':
        mapped.push({
          item: mergeInventoryItem(mapLock(row, now), existingItems),
          denylist: row.denylist,
        });
        break;
      case 'access_control':
        mapped.push({
          item: mergeInventoryItem(mapAccessControl(row, now), existingItems),
          denylist: row.denylist,
        });
        break;
      case 'bridge':
        mapped.push({ item: mergeInventoryItem(mapBridge(row, now), existingItems) });
        break;
      case 'friend_node':
        mapped.push({ item: mergeInventoryItem(mapFriendNode(row, now), existingItems) });
        break;
      case 'gateway':
        break;
      default:
        break;
    }
  }

  return mapped;
}

export function applyInventorySnapshotBinary(
  binary: Buffer,
  existingItems: DeviceInventoryItem[],
): { payload: CloudInventorySnapshotPayload; mapped: MappedSnapshotDevice[] } {
  const payload = parseInventorySnapshotPayload(binary);
  const mapped = mapSnapshotToInventoryItems(payload, existingItems);
  return { payload, mapped };
}
