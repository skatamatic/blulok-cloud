/** Map BluLok `device_status` to gateway-style `online` for recovery snapshots. */
export function snapshotOnlineFromBluLokDeviceStatus(deviceStatus: unknown): boolean {
  return deviceStatus === 'online' || deviceStatus === 'low_battery';
}

/** Map access control `status` to gateway-style `online` for recovery snapshots. */
export function snapshotOnlineFromAccessControlStatus(status: unknown): boolean {
  return status === 'online';
}

/** Map bridge/friend_node `state` to gateway-style `online` for recovery snapshots. */
export function snapshotOnlineFromInfraState(state: unknown): boolean {
  if (state == null || state === '') return false;
  const normalized = String(state).trim().toLowerCase();
  return normalized === 'healthy' || normalized === 'ok' || normalized === 'online';
}
