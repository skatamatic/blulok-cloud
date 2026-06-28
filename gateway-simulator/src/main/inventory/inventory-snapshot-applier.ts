import type {
  AccessControlInventoryItem,
  BridgeInventoryItem,
  DeviceInventoryItem,
  FriendNodeInventoryItem,
  LockInventoryItem,
  LockState,
} from '@protocol/device-kinds';
import { deviceKey } from '../devices/IDeviceModel';

/** Cloud inventory snapshot device row (recovery push payload). */
export type CloudInventorySnapshotDevice = {
  kind: string;
  device_id?: string;
  serial?: string;
  unit_id?: string | null;
  unit_number?: string | null;
  lock_number?: number | null;
  relay_channel?: number | null;
  lock_id?: string | null;
  state?: string | null;
  firmware_version?: string | null;
  info?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  denylist?: Array<{ sub: string; exp?: number }>;
};

export type CloudInventorySnapshotPayload = {
  schema_version?: number;
  facility_id: string;
  gateway_id: string;
  generated_at?: string;
  devices: CloudInventorySnapshotDevice[];
};

function readFirmwareVersion(
  row: CloudInventorySnapshotDevice,
): string | undefined {
  if (row.firmware_version?.trim()) return row.firmware_version.trim();
  const fromProps = row.properties?.firmware_version;
  if (typeof fromProps === 'string' && fromProps.trim()) return fromProps.trim();
  return undefined;
}

function mapLock(row: CloudInventorySnapshotDevice, now: string): LockInventoryItem {
  // Cloud inventory sync and DEVICE_DELETED tombstones use device serial as lock_id.
  const serial = String(row.serial || '').trim();
  const cloudLockId = String(row.lock_id || row.device_id || '').trim();
  const lockId = serial || cloudLockId;
  if (!lockId) throw new Error('Inventory snapshot lock missing identifier');

  const rawState = row.state?.toUpperCase();
  const state: LockState | undefined =
    rawState === 'CLOSED' || rawState === 'OPENED' || rawState === 'ERROR' || rawState === 'UNKNOWN'
      ? rawState
      : undefined;

  return {
    kind: 'lock',
    lock_id: lockId,
    cloud_device_id: row.device_id?.trim() || undefined,
    lock_number: typeof row.lock_number === 'number' ? row.lock_number : undefined,
    state: state ?? 'CLOSED',
    locked: true,
    firmware_version: readFirmwareVersion(row),
    online: true,
    last_seen: now,
  };
}

function mapAccessControl(row: CloudInventorySnapshotDevice, now: string): AccessControlInventoryItem {
  const serial = String(row.serial || '').trim();
  const accessId = serial || String(row.device_id || '').trim();
  if (!accessId) throw new Error('Inventory snapshot access_control missing identifier');

  return {
    kind: 'access_control',
    access_id: accessId,
    cloud_device_id: row.device_id?.trim() || undefined,
    relay_channel: typeof row.relay_channel === 'number' ? row.relay_channel : undefined,
    device_type: 'gate',
    locked: true,
    firmware_version: readFirmwareVersion(row),
    online: true,
    last_seen: now,
  };
}

function mapBridge(row: CloudInventorySnapshotDevice, now: string): BridgeInventoryItem {
  const serial = String(row.serial || row.device_id || '').trim();
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

function mapFriendNode(row: CloudInventorySnapshotDevice, now: string): FriendNodeInventoryItem {
  const serial = String(row.serial || row.device_id || '').trim();
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

  for (const row of payload.devices) {
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
