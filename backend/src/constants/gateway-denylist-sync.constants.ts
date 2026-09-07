/**
 * When true, cloud unicasts `DENYLIST_SYNC` on active-gateway AUTH_OK.
 * Default off until production gateway firmware has parity (incremental
 * DENYLIST_ADD/REMOVE + inventory `operational_devices` still apply).
 */
export function isGatewayDenylistSyncEnabled(): boolean {
  const raw = process.env.GATEWAY_DENYLIST_SYNC_ENABLED;
  return raw === 'true' || raw === '1';
}
