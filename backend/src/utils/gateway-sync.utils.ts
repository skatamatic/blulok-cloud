import {
  getGatewayDeviceKindDefinition,
  isAllowedInventoryKind,
  isNetworkInfraSyncKind,
  type GatewayInventoryKind,
  type NetworkInfraSyncKind,
  type OperationalDeviceKind,
} from '@/config/gateway-device-kinds';

export type GatewayDeviceKind = OperationalDeviceKind;

/** Default relay when gateway omits relay_channel (single-relay access hardware). */
export const DEFAULT_ACCESS_RELAY_CHANNEL = 1;

export function resolveAccessRelayChannel(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_ACCESS_RELAY_CHANNEL;
  }
  return Number(raw);
}

export interface AccessDeviceInventoryItem {
  kind: 'access_control';
  /** Hardware serial for access control (persisted as device_serial in admin API) */
  access_id: string;
  /** Actuation channel 1–8; defaults to {@link DEFAULT_ACCESS_RELAY_CHANNEL} when omitted */
  relay_channel?: number;
  device_type?: 'gate' | 'elevator' | 'door';
  name?: string;
  location_description?: string;
  online?: boolean;
  locked?: boolean;
  last_seen?: string | Date;
}

export interface AccessDeviceStateUpdate {
  kind: 'access_control';
  access_id: string;
  relay_channel?: number;
  online?: boolean;
  locked?: boolean;
  last_seen?: string | Date;
}

export function formatAccessDeviceKey(accessId: string, relayChannel: number): string {
  return `${accessId}::${relayChannel}`;
}

/** Composite sync key for persisted access control rows ({device_serial}::{relay}). */
export function resolveAccessDeviceKey(device: {
  device_serial?: string | null;
  relay_channel: number;
}): string {
  const serial = typeof device.device_serial === 'string' ? device.device_serial.trim() : '';
  if (!serial) {
    throw new Error('Access control device must have device_serial');
  }
  return formatAccessDeviceKey(serial, device.relay_channel);
}

export function isValidRelayChannel(relayChannel: number): boolean {
  return Number.isInteger(relayChannel) && relayChannel >= 1 && relayChannel <= 8;
}

export function extractAccessId(item: Record<string, unknown>): string {
  const raw = item.access_id;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Access control item must include access_id');
  }
  return raw.trim();
}

export function isGatewaySyncManaged(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  if (metadata.adminIdentityOverride === true) {
    return false;
  }
  return metadata.createdFromGatewaySync === true;
}

export function hasAdminIdentityOverride(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && typeof metadata === 'object' && metadata.adminIdentityOverride === true);
}

export interface NetworkInfraInventoryItem {
  kind: NetworkInfraSyncKind;
  serial: string;
  state?: string;
  firmware_version?: string;
  info?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GatewayInventoryUpdateItem {
  kind: 'gateway';
  serial?: string;
  state?: string;
  firmware_version?: string;
  info?: Record<string, unknown>;
  [key: string]: unknown;
}

export function resolveGatewayDeviceKind(item: Record<string, unknown>): GatewayDeviceKind {
  const kind = item.kind;
  if (kind === 'lock' || kind === 'access_control') {
    return kind;
  }
  throw new Error('Device item must include kind ("lock" or "access_control")');
}

export function classifyInventoryItem(item: Record<string, unknown>): {
  category: 'operational' | 'network_infra';
  kind: GatewayInventoryKind;
} {
  const kind = item.kind;
  if (typeof kind !== 'string' || !isAllowedInventoryKind(kind)) {
    throw new Error(
      `Device item kind must be one of: lock, access_control, bridge, friend_node, gateway`,
    );
  }

  const definition = getGatewayDeviceKindDefinition(kind)!;
  return {
    category: definition.category,
    kind,
  };
}

export function partitionInventoryItems<T extends Record<string, unknown>>(
  devices: T[],
): {
  locks: T[];
  accessControl: T[];
  networkInfra: T[];
  gatewayUpdates: T[];
} {
  const locks: T[] = [];
  const accessControl: T[] = [];
  const networkInfra: T[] = [];
  const gatewayUpdates: T[] = [];

  for (const device of devices) {
    const { category, kind } = classifyInventoryItem(device);
    if (kind === 'gateway') {
      gatewayUpdates.push(device);
      continue;
    }
    if (category === 'network_infra') {
      if (isNetworkInfraSyncKind(kind)) {
        networkInfra.push(device);
      }
      continue;
    }
    if (kind === 'access_control') {
      accessControl.push(device);
    } else {
      locks.push(device);
    }
  }

  return { locks, accessControl, networkInfra, gatewayUpdates };
}

export function partitionInventoryByKind<T extends Record<string, unknown>>(
  devices: T[]
): { locks: T[]; accessControl: T[] } {
  const partitioned = partitionInventoryItems(devices);
  return {
    locks: partitioned.locks,
    accessControl: partitioned.accessControl,
  };
}

export function partitionStateUpdatesByKind<T extends Record<string, unknown>>(
  updates: T[]
): { locks: T[]; accessControl: T[] } {
  const locks: T[] = [];
  const accessControl: T[] = [];

  for (const update of updates) {
    const kind = resolveGatewayDeviceKind(update);
    if (kind === 'access_control') {
      accessControl.push(update);
    } else {
      locks.push(update);
    }
  }

  return { locks, accessControl };
}
