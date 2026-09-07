import type { DenylistEntry, DeviceSimulatorState } from '@protocol/device-simulator-state';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import { deviceKey } from './IDeviceModel';
import type { DeviceRegistry } from './DeviceRegistry';

/** Cloud denylist row (inventory sync / recovery snapshot). */
export type CloudDenylistEntry = {
  sub: string;
  exp?: number;
};

export type OperationalDeviceDenylistSync = {
  cloud_device_id: string;
  kind: 'lock' | 'access_control';
  serial: string;
  relay_channel?: number | null;
  denylist: CloudDenylistEntry[];
};

export function cloudDenylistToSim(entries: CloudDenylistEntry[]): DenylistEntry[] {
  const now = new Date().toISOString();
  return entries.map((entry) => ({
    sub: entry.sub,
    exp: entry.exp,
    addedAt: now,
  }));
}

export function replaceSimDenylist(sim: DeviceSimulatorState, entries: CloudDenylistEntry[]): void {
  sim.denylist = cloudDenylistToSim(entries);
}

export function findRecordKeyForOperationalSync(
  registry: DeviceRegistry,
  row: OperationalDeviceDenylistSync,
): string | undefined {
  const serialNeedle = row.serial.trim().toLowerCase();

  for (const [key, record] of registry.iterRecords()) {
    const item = record.item;
    if (item.cloud_device_id === row.cloud_device_id) {
      return key;
    }
  }

  for (const [key, record] of registry.iterRecords()) {
    const item = record.item;
    if (row.kind === 'lock' && item.kind === 'lock' && item.lock_id.trim().toLowerCase() === serialNeedle) {
      return key;
    }
    if (
      row.kind === 'access_control'
      && item.kind === 'access_control'
      && item.access_id.trim().toLowerCase() === serialNeedle
      && (item.relay_channel ?? 1) === (row.relay_channel ?? 1)
    ) {
      return key;
    }
  }

  return undefined;
}

export function applyOperationalDenylistSync(
  registry: DeviceRegistry,
  rows: OperationalDeviceDenylistSync[],
): number {
  let applied = 0;
  for (const row of rows) {
    const key = findRecordKeyForOperationalSync(registry, row);
    if (!key) continue;

    registry.update(key, { cloud_device_id: row.cloud_device_id });
    registry.updateSimState(key, (sim) => {
      replaceSimDenylist(sim, row.denylist);
    });
    applied += 1;
  }
  return applied;
}

export function buildDenylistByKeyFromSnapshot(
  mapped: Array<{ item: DeviceInventoryItem; denylist?: CloudDenylistEntry[] }>,
): Map<string, CloudDenylistEntry[]> | undefined {
  const map = new Map<string, CloudDenylistEntry[]>();
  let sawDenylistField = false;
  for (const row of mapped) {
    if (row.denylist === undefined) continue;
    sawDenylistField = true;
    map.set(deviceKey(row.item), row.denylist);
  }
  return sawDenylistField ? map : undefined;
}

export function countDenylistEntriesInMap(map: Map<string, CloudDenylistEntry[]> | undefined): number {
  if (!map) return 0;
  let total = 0;
  for (const entries of map.values()) {
    total += entries.length;
  }
  return total;
}
