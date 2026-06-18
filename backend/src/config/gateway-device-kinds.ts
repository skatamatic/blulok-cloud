export type DeviceCategory = 'operational' | 'network_infra';

export type OperationalDeviceKind = 'lock' | 'access_control';

export type NetworkInfraSyncKind = 'bridge' | 'friend_node';

export type NetworkInfraDisplayKind = 'gateway';

export type GatewayInventoryKind =
  | OperationalDeviceKind
  | NetworkInfraSyncKind
  | NetworkInfraDisplayKind;

export interface GatewayDeviceKindDefinition {
  kind: GatewayInventoryKind;
  category: DeviceCategory;
  syncManaged: boolean;
  includedInRecoverySnapshot: boolean;
  supportsCloudDeleteCommand: boolean;
}

const OPERATIONAL_KINDS: GatewayDeviceKindDefinition[] = [
  {
    kind: 'lock',
    category: 'operational',
    syncManaged: true,
    includedInRecoverySnapshot: true,
    supportsCloudDeleteCommand: true,
  },
  {
    kind: 'access_control',
    category: 'operational',
    syncManaged: true,
    includedInRecoverySnapshot: true,
    supportsCloudDeleteCommand: true,
  },
];

const NETWORK_INFRA_SYNC_KINDS: GatewayDeviceKindDefinition[] = [
  {
    kind: 'bridge',
    category: 'network_infra',
    syncManaged: true,
    includedInRecoverySnapshot: true,
    supportsCloudDeleteCommand: true,
  },
  {
    kind: 'friend_node',
    category: 'network_infra',
    syncManaged: true,
    includedInRecoverySnapshot: true,
    supportsCloudDeleteCommand: true,
  },
];

const NETWORK_INFRA_DISPLAY_KINDS: GatewayDeviceKindDefinition[] = [
  {
    kind: 'gateway',
    category: 'network_infra',
    syncManaged: false,
    includedInRecoverySnapshot: false,
    supportsCloudDeleteCommand: false,
  },
];

export const GATEWAY_DEVICE_KIND_REGISTRY: GatewayDeviceKindDefinition[] = [
  ...OPERATIONAL_KINDS,
  ...NETWORK_INFRA_SYNC_KINDS,
  ...NETWORK_INFRA_DISPLAY_KINDS,
];

const REGISTRY_BY_KIND = new Map(
  GATEWAY_DEVICE_KIND_REGISTRY.map((entry) => [entry.kind, entry]),
);

export const ALLOWED_INVENTORY_KINDS: GatewayInventoryKind[] = GATEWAY_DEVICE_KIND_REGISTRY.map(
  (entry) => entry.kind,
);

export const NETWORK_INFRA_SYNC_KIND_VALUES: NetworkInfraSyncKind[] = ['bridge', 'friend_node'];

export function getGatewayDeviceKindDefinition(
  kind: string,
): GatewayDeviceKindDefinition | undefined {
  return REGISTRY_BY_KIND.get(kind as GatewayInventoryKind);
}

export function isAllowedInventoryKind(kind: string): kind is GatewayInventoryKind {
  return REGISTRY_BY_KIND.has(kind as GatewayInventoryKind);
}

export function isNetworkInfraSyncKind(kind: string): kind is NetworkInfraSyncKind {
  return (NETWORK_INFRA_SYNC_KIND_VALUES as string[]).includes(kind);
}

export function mapInfraStateToStatus(state: string | null | undefined): string {
  if (!state) return 'unknown';
  const normalized = state.trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'ok' || normalized === 'online') {
    return 'online';
  }
  if (normalized === 'error' || normalized === 'fault') {
    return 'error';
  }
  return normalized;
}
