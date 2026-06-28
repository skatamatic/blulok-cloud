export type DeviceCategory = 'operational' | 'network_infra';

export type OperationalDeviceKind = 'lock' | 'access_control';
export type NetworkInfraSyncKind = 'bridge' | 'friend_node';
export type NetworkInfraDisplayKind = 'gateway';

export type GatewayInventoryKind =
  | OperationalDeviceKind
  | NetworkInfraSyncKind
  | NetworkInfraDisplayKind;

export const GATEWAY_INVENTORY_KINDS: GatewayInventoryKind[] = [
  'lock',
  'access_control',
  'bridge',
  'friend_node',
  'gateway',
];

/** Kinds the user can add via the simulator UI (excludes gateway — a site cannot nest gateways). */
export const ADDABLE_INVENTORY_KINDS: GatewayInventoryKind[] = GATEWAY_INVENTORY_KINDS.filter(
  (k) => k !== 'gateway',
);

export function filterManagedInventoryDevices(items: DeviceInventoryItem[]): DeviceInventoryItem[] {
  // Gateway self is reported separately on inventory sync (updates gateways.firmware_version).
  return items.filter((item) => item.kind !== 'gateway');
}

export function assertAddableInventoryKind(
  kind: string,
): asserts kind is Exclude<GatewayInventoryKind, 'gateway'> {
  if (kind === 'gateway') {
    throw new Error(
      'Gateway devices cannot be added to a gateway inventory — the simulator instance is the gateway',
    );
  }
  if (!isGatewayInventoryKind(kind)) {
    throw new Error(`Unknown device kind: ${kind}`);
  }
}

export type AccessControlDeviceType = 'gate' | 'door' | 'elevator';

export type LockState = 'CLOSED' | 'OPENED' | 'ERROR' | 'UNKNOWN';

export type LockInventoryItem = {
  kind: 'lock';
  lock_id: string;
  /** Cloud BluLok device UUID — used to match JWT command targets. */
  cloud_device_id?: string;
  lock_number?: number;
  state?: LockState;
  locked?: boolean;
  battery_level?: number;
  battery_unit?: string;
  firmware_version?: string;
  online?: boolean;
  signal_strength?: number;
  temperature_value?: number;
  temperature_unit?: string;
  error_code?: string;
  error_message?: string;
  last_seen?: string;
};

export type AccessControlInventoryItem = {
  kind: 'access_control';
  access_id: string;
  /** Cloud access_control device UUID — used to match JWT command targets. */
  cloud_device_id?: string;
  relay_channel?: number;
  device_type?: AccessControlDeviceType;
  name?: string;
  location_description?: string;
  state?: string;
  locked?: boolean;
  firmware_version?: string;
  online?: boolean;
  error_code?: string;
  error_message?: string;
  last_seen?: string;
};

export type BridgeInventoryItem = {
  kind: 'bridge';
  serial: string;
  state?: string;
  firmware_version?: string;
  online?: boolean;
  info?: Record<string, unknown>;
  last_seen?: string;
};

export type FriendNodeInventoryItem = {
  kind: 'friend_node';
  serial: string;
  state?: string;
  firmware_version?: string;
  online?: boolean;
  info?: Record<string, unknown>;
  last_seen?: string;
};

export type GatewaySelfInventoryItem = {
  kind: 'gateway';
  serial: string;
  state?: string;
  firmware_version?: string;
  info?: Record<string, unknown>;
  last_seen?: string;
};

export type DeviceInventoryItem =
  | LockInventoryItem
  | AccessControlInventoryItem
  | BridgeInventoryItem
  | FriendNodeInventoryItem
  | GatewaySelfInventoryItem;

export type DeviceStateUpdate = Partial<DeviceInventoryItem> & {
  kind: GatewayInventoryKind;
};

export function isGatewayInventoryKind(kind: string): kind is GatewayInventoryKind {
  return (GATEWAY_INVENTORY_KINDS as readonly string[]).includes(kind);
}
