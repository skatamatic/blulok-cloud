/**
 * Must match backend `GATEWAY_OFFLINE_GRACE_MS` — delay before surfacing offline toasts
 * for transient `/ws/gateway` disconnects (Cloud Run idle timeout, proxy blips, etc.).
 */
export const GATEWAY_OFFLINE_TOAST_GRACE_MS = 60_000;
