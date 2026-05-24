export type GatewayDeviceKind = 'lock' | 'access_control';

export interface AccessDeviceInventoryItem {
  kind?: 'access_control';
  /** Hardware serial — parallel to lock_id for BluLok devices */
  access_id: string;
  relay_channel: number;
  device_type?: 'gate' | 'elevator' | 'door';
  name?: string;
  location_description?: string;
  online?: boolean;
  locked?: boolean;
  last_seen?: string | Date;
}

export interface AccessDeviceStateUpdate {
  kind?: 'access_control';
  access_id: string;
  relay_channel: number;
  online?: boolean;
  locked?: boolean;
  last_seen?: string | Date;
}

export function formatAccessDeviceKey(accessId: string, relayChannel: number): string {
  return `${accessId}::${relayChannel}`;
}

/** Stable composite key for persisted access control rows (handles legacy missing serial). */
export function resolveAccessDeviceKey(device: {
  device_serial?: string | null;
  id?: string;
  relay_channel: number;
}): string {
  const serial =
    (typeof device.device_serial === 'string' && device.device_serial.trim()) ||
    (device.id ? `legacy-${String(device.id).slice(0, 8)}` : 'unknown');
  return formatAccessDeviceKey(serial, device.relay_channel);
}

export function isValidRelayChannel(relayChannel: number): boolean {
  return Number.isInteger(relayChannel) && relayChannel >= 1 && relayChannel <= 8;
}

export function extractAccessId(item: Record<string, unknown>): string {
  const raw = item.access_id ?? item.device_serial;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Access control item must include access_id (device serial)');
  }
  return raw.trim();
}

export function isGatewaySyncManaged(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  return (
    metadata.createdFromGatewaySync === true ||
    metadata.createdFromInventorySync === true
  );
}

export function inferDeviceKind(item: Record<string, unknown>): GatewayDeviceKind {
  const kind = item.kind;
  if (kind === 'lock') return 'lock';
  if (kind === 'access_control') return 'access_control';

  const hasLockId = typeof item.lock_id === 'string' && String(item.lock_id).trim().length > 0;
  const hasAccessId =
    (typeof item.access_id === 'string' && String(item.access_id).trim().length > 0) ||
    (typeof item.device_serial === 'string' && String(item.device_serial).trim().length > 0);

  if (hasLockId && hasAccessId) {
    throw new Error('Device item must specify kind when both lock_id and access_id are present');
  }
  if (hasAccessId) return 'access_control';
  if (hasLockId) return 'lock';

  throw new Error('Device item must include lock_id or access_id');
}

export function inferStateUpdateKind(item: Record<string, unknown>): GatewayDeviceKind {
  const kind = item.kind;
  if (kind === 'lock') return 'lock';
  if (kind === 'access_control') return 'access_control';

  const hasLockId = typeof item.lock_id === 'string' && String(item.lock_id).trim().length > 0;
  const hasAccessId =
    (typeof item.access_id === 'string' && String(item.access_id).trim().length > 0) ||
    (typeof item.device_serial === 'string' && String(item.device_serial).trim().length > 0);

  if (hasLockId && hasAccessId) {
    throw new Error('State update must specify kind when both lock_id and access_id are present');
  }
  if (hasAccessId) return 'access_control';
  if (hasLockId) return 'lock';

  throw new Error('State update must include lock_id or access_id');
}

export function partitionInventoryByKind<T extends Record<string, unknown>>(
  devices: T[]
): { locks: T[]; accessControl: T[] } {
  const locks: T[] = [];
  const accessControl: T[] = [];

  for (const device of devices) {
    const kind = inferDeviceKind(device);
    if (kind === 'access_control') {
      accessControl.push(device);
    } else {
      locks.push(device);
    }
  }

  return { locks, accessControl };
}

export function partitionStateUpdatesByKind<T extends Record<string, unknown>>(
  updates: T[]
): { locks: T[]; accessControl: T[] } {
  const locks: T[] = [];
  const accessControl: T[] = [];

  for (const update of updates) {
    const kind = inferStateUpdateKind(update);
    if (kind === 'access_control') {
      accessControl.push(update);
    } else {
      locks.push(update);
    }
  }

  return { locks, accessControl };
}
