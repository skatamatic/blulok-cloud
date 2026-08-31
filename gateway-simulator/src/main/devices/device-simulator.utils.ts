import { randomBytes } from 'crypto';
import type { DeviceInventoryItem, GatewayInventoryKind } from '@protocol/device-kinds';
import type {
  DenylistEntry,
  DeviceSimulatorState,
  SimulatedDeviceRecord,
  StoredAccessCode,
} from '@protocol/device-simulator-state';
import { deviceKey } from './IDeviceModel';

const MAX_COMMAND_LOG = 24;

export function generateSimulatedKeyB64(): string {
  return randomBytes(32).toString('base64url');
}

export function createDefaultDeviceSimState(
  facilityId: string,
  kind: GatewayInventoryKind,
  operationsKeyPublicB64?: string,
): DeviceSimulatorState {
  const opsKey = operationsKeyPublicB64?.trim() || generateSimulatedKeyB64();
  return {
    facilityId,
    rootKeyPublicB64: generateSimulatedKeyB64(),
    operationsKeyPublicB64: opsKey,
    denylist: [],
    accessCodes: kind === 'access_control' ? [] : [],
    recentCommands: [],
  };
}

export function appendCommandLog(
  sim: DeviceSimulatorState,
  entry: Omit<DeviceSimulatorState['recentCommands'][number], 'at'>,
): void {
  sim.recentCommands.unshift({ ...entry, at: new Date().toISOString() });
  if (sim.recentCommands.length > MAX_COMMAND_LOG) {
    sim.recentCommands.length = MAX_COMMAND_LOG;
  }
}

export function applyDenylistAdd(
  sim: DeviceSimulatorState,
  entries: Array<{ sub: string; exp?: number }>,
): number {
  let added = 0;
  const now = new Date().toISOString();
  for (const entry of entries) {
    const sub = entry.sub?.trim();
    if (!sub) continue;
    const existing = sim.denylist.find((row) => row.sub === sub);
    if (existing) {
      existing.exp = entry.exp;
      continue;
    }
    sim.denylist.push({ sub, exp: entry.exp, addedAt: now });
    added += 1;
  }
  return added;
}

export function applyDenylistRemove(
  sim: DeviceSimulatorState,
  entries: Array<{ sub: string; exp?: number }>,
): number {
  const subs = new Set(entries.map((e) => e.sub?.trim()).filter(Boolean));
  const before = sim.denylist.length;
  sim.denylist = sim.denylist.filter((row) => !subs.has(row.sub));
  return before - sim.denylist.length;
}

export function applyAccessCodesForDevice(
  sim: DeviceSimulatorState,
  validCodes: StoredAccessCode[],
  nonce: string,
): void {
  sim.accessCodes = validCodes.map((row) => ({ ...row }));
  sim.lastAccessCodeNonce = nonce;
  sim.lastAccessCodePushAt = new Date().toISOString();
}

export function rotateDeviceOperationsKey(sim: DeviceSimulatorState, newOpsPublicB64: string, ts: number): void {
  sim.operationsKeyPublicB64 = newOpsPublicB64;
  sim.operationsKeyRotatedAt = new Date(ts * 1000).toISOString();
}

export function applySecureTimeSync(sim: DeviceSimulatorState, ts: number): void {
  sim.lastSecureTimeSyncTs = ts;
  sim.lastSecureTimeSyncAt = new Date(ts * 1000).toISOString();
}

/** Legacy persisted profiles may still carry rootKeyPrivateB64 — real locks never store it. */
type LegacyDeviceSimulatorState = DeviceSimulatorState & { rootKeyPrivateB64?: string };

export function stripLegacySimFields(sim: LegacyDeviceSimulatorState): DeviceSimulatorState {
  const { rootKeyPrivateB64: _legacyRootPrivate, ...clean } = sim;
  return clean;
}

export function cloneSimState(sim: LegacyDeviceSimulatorState): DeviceSimulatorState {
  const clean = stripLegacySimFields(sim);
  return {
    ...clean,
    denylist: clean.denylist.map((row) => ({ ...row })),
    accessCodes: clean.accessCodes.map((row) => ({ ...row })),
    recentCommands: clean.recentCommands.map((row) => ({ ...row })),
  };
}

export function normalizeProfileDeviceRecords(
  profile: { facilityId: string; devices?: DeviceInventoryItem[]; deviceRecords?: SimulatedDeviceRecord[] },
  operationsKeyPublicB64?: string,
): SimulatedDeviceRecord[] {
  if (profile.deviceRecords?.length) {
    return profile.deviceRecords.map((record) => ({
      item: record.item,
      sim: cloneSimState(record.sim),
    }));
  }
  return (profile.devices ?? []).map((item) => ({
    item,
    sim: createDefaultDeviceSimState(profile.facilityId, item.kind, operationsKeyPublicB64),
  }));
}

export function recordsToInventoryItems(records: SimulatedDeviceRecord[]): DeviceInventoryItem[] {
  return records.map((record) => record.item);
}

export function buildDeviceRecordsMap(records: SimulatedDeviceRecord[]): Record<string, DeviceSimulatorState> {
  const map: Record<string, DeviceSimulatorState> = {};
  for (const record of records) {
    map[deviceKey(record.item)] = record.sim;
  }
  return map;
}

export function isDenylistBlocked(sim: DeviceSimulatorState, sub: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const row = sim.denylist.find((entry) => entry.sub === sub);
  if (!row) return false;
  if (row.exp != null && row.exp > 0 && row.exp <= nowSec) return false;
  return true;
}
