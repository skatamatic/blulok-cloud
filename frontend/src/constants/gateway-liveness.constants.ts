/**
 * Must match backend `GATEWAY_OFFLINE_GRACE_MS`.
 * Product liveness (gateway badge / device reachability / toasts) is grace-aware on
 * the backend; the dashboard reacts to confirmed offline without a second debounce.
 */
export const GATEWAY_OFFLINE_GRACE_MS = 20_000;
