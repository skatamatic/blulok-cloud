export type GatewayOperationalStatus = 'online' | 'offline' | 'error' | 'maintenance';

export type GatewayType = 'physical' | 'http' | 'simulated' | string;

/**
 * Single display rule for facility gateway connectivity across Facility and Gateway tabs,
 * for every gateway type.
 *
 * The live inbound `/ws/gateway` session is the authoritative liveness signal: if the gateway
 * is sending any traffic within the keepalive window, it is online. `connected` is delivered in
 * real time via the `gateway_status_update` broadcast and reconciled by the HTTP status poll.
 *
 * - `connected === true`  → online
 * - `connected === false` → offline
 * - `connected === null`  → liveness not yet known; fall back to the last persisted DB status
 *   so we never flash "offline" on first paint or during a transient cloud-API hiccup.
 *
 * Admin-set `maintenance`/`error` states always take precedence over live connectivity.
 */
export function resolveEffectiveGatewayStatus(params: {
  dbStatus: GatewayOperationalStatus | null | undefined;
  connected: boolean | null;
}): GatewayOperationalStatus {
  const { dbStatus, connected } = params;
  const inventoryStatus = dbStatus ?? 'offline';

  if (inventoryStatus === 'maintenance' || inventoryStatus === 'error') {
    return inventoryStatus;
  }

  if (connected === true) return 'online';
  if (connected === false) return 'offline';

  // Liveness unknown yet → trust last persisted status rather than defaulting to offline.
  return inventoryStatus;
}

export const gatewayOperationalStatusColors: Record<GatewayOperationalStatus, string> = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
};
