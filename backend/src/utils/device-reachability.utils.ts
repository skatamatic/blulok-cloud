import { mapInfraStateToStatus } from '@/config/gateway-device-kinds';
import { snapshotOnlineFromInfraState } from '@/utils/inventory-snapshot-online.utils';

export type GatewayDbStatus = 'online' | 'offline' | 'error' | 'maintenance' | string;

export type StatusUnreachableReason =
  | 'gateway_offline'
  | 'gateway_maintenance'
  | 'gateway_error';

export type GatewayLivenessInput = {
  dbStatus: GatewayDbStatus | null | undefined;
  connected: boolean | null;
};

export type DeviceReachabilityResult<TStatus extends string = string> = {
  effective: TStatus;
  reported: TStatus;
  status_unreachable_reason: StatusUnreachableReason | null;
};

export type BluLokDeviceStatus = 'online' | 'offline' | 'low_battery' | 'error';
export type AccessControlDeviceStatus = 'online' | 'offline' | 'error' | 'maintenance';

/** Mirror frontend resolveEffectiveGatewayStatus — gateway is reachable for child devices. */
export function isGatewayReachable(params: GatewayLivenessInput): boolean {
  const { dbStatus, connected } = params;
  const inventoryStatus = dbStatus ?? 'offline';

  if (inventoryStatus === 'maintenance' || inventoryStatus === 'error') {
    return false;
  }

  if (connected === true) return true;
  if (connected === false) return false;

  return inventoryStatus === 'online';
}

export function resolveGatewayUnreachableReason(
  params: GatewayLivenessInput,
): StatusUnreachableReason | null {
  const { dbStatus, connected } = params;
  const inventoryStatus = dbStatus ?? 'offline';

  if (inventoryStatus === 'maintenance') return 'gateway_maintenance';
  if (inventoryStatus === 'error') return 'gateway_error';

  if (connected === false) return 'gateway_offline';
  if (connected === true) return null;

  if (inventoryStatus === 'offline') return 'gateway_offline';
  return null;
}

function coerceWhenUnreachable<T extends string>(
  reported: T,
  gatewayReachable: boolean,
  unreachableReason: StatusUnreachableReason | null,
  shouldCoerce: (reported: T) => boolean,
  offlineValue: T,
): DeviceReachabilityResult<T> {
  if (gatewayReachable || !shouldCoerce(reported)) {
    return {
      effective: reported,
      reported,
      status_unreachable_reason: null,
    };
  }

  return {
    effective: offlineValue,
    reported,
    status_unreachable_reason: unreachableReason,
  };
}

export function resolveEffectiveBluLokDeviceStatus(
  reported: BluLokDeviceStatus | string | null | undefined,
  gatewayLiveness: GatewayLivenessInput,
): DeviceReachabilityResult<BluLokDeviceStatus> {
  const normalized = (reported ?? 'offline') as BluLokDeviceStatus;
  const reachable = isGatewayReachable(gatewayLiveness);
  const reason = resolveGatewayUnreachableReason(gatewayLiveness);

  return coerceWhenUnreachable(
    normalized,
    reachable,
    reason,
    (s) => s === 'online' || s === 'low_battery',
    'offline',
  );
}

export function resolveEffectiveAccessControlStatus(
  reported: AccessControlDeviceStatus | string | null | undefined,
  gatewayLiveness: GatewayLivenessInput,
): DeviceReachabilityResult<AccessControlDeviceStatus> {
  const normalized = (reported ?? 'offline') as AccessControlDeviceStatus;
  const reachable = isGatewayReachable(gatewayLiveness);
  const reason = resolveGatewayUnreachableReason(gatewayLiveness);

  return coerceWhenUnreachable(
    normalized,
    reachable,
    reason,
    (s) => s === 'online',
    'offline',
  );
}

/** Infra rows store raw `state`; UI uses mapped `status`. Coerce when reported state implies online. */
export function resolveEffectiveInfraStatus(
  reportedState: string | null | undefined,
  gatewayLiveness: GatewayLivenessInput,
): DeviceReachabilityResult<string> {
  const reportedStatus = mapInfraStateToStatus(reportedState ?? null);
  const reachable = isGatewayReachable(gatewayLiveness);
  const reason = resolveGatewayUnreachableReason(gatewayLiveness);
  const wasOnline = snapshotOnlineFromInfraState(reportedState);

  if (reachable || !wasOnline) {
    return {
      effective: reportedStatus,
      reported: reportedStatus,
      status_unreachable_reason: null,
    };
  }

  return {
    effective: 'offline',
    reported: reportedStatus,
    status_unreachable_reason: reason,
  };
}

export function isBluLokDeviceOnlineForDisplay(status: BluLokDeviceStatus | string): boolean {
  return status === 'online' || status === 'low_battery';
}

export function isAccessControlOnlineForDisplay(status: AccessControlDeviceStatus | string): boolean {
  return status === 'online';
}
