/**
 * Grace period before a gateway disconnect is treated as a real outage.
 * Cloud Run and other proxies may drop `/ws/gateway` periodically; gateways should
 * reconnect within this window without triggering offline alerts.
 */
export const GATEWAY_OFFLINE_GRACE_MS = Number(process.env.GATEWAY_OFFLINE_GRACE_MS) || 60_000;
