/**
 * Grace period before a gateway disconnect is treated as a real outage.
 * Cloud Run and other proxies may drop `/ws/gateway` periodically; gateways should
 * reconnect within this window without triggering offline alerts or product-level
 * "offline" (UI pills / device reachability). Transport socket status stays raw —
 * only product liveness (`getFacilityProductLiveness`) honors this grace.
 *
 * Runtime overrides (dev/e2e) go through `GatewayEventsService.getOfflineGraceMs()`.
 */
export const DEFAULT_GATEWAY_OFFLINE_GRACE_MS = Number(process.env.GATEWAY_OFFLINE_GRACE_MS) || 20_000;

/** Default env/boot value — prefer {@link GatewayEventsService.getOfflineGraceMs} when a process override may apply. */
export const GATEWAY_OFFLINE_GRACE_MS = DEFAULT_GATEWAY_OFFLINE_GRACE_MS;

/** Allowed range for POST /api/v1/dev/gateway-offline-grace overrides. */
export const GATEWAY_OFFLINE_GRACE_OVERRIDE_MIN_MS = 0;
export const GATEWAY_OFFLINE_GRACE_OVERRIDE_MAX_MS = 120_000;

/**
 * Allow Cloud Run instance clocks to differ slightly when comparing
 * `gateways.last_seen` (written on AUTH) to the local disconnect timestamp.
 */
export const GATEWAY_OFFLINE_CONFIRM_CLOCK_SKEW_MS = 2_000;
