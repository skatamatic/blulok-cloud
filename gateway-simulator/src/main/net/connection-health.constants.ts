/** Backend sends JSON PING after ~10s idle and closes at 30s — probe faster than that. */
export const WS_PROBE_INTERVAL_MS = 12_000;

/** Wait for WS pong frame after client-initiated ping. */
export const WS_PROBE_TIMEOUT_MS = 5_000;

/** Consecutive failed WS probes before the connection is torn down. */
export const MAX_MISSED_WS_PROBES = 3;

/** After JSON PONG, backend should answer with PONG_OK. */
export const JSON_PONG_OK_TIMEOUT_MS = 5_000;

/** Missed JSON heartbeats (PING without PONG_OK chain) before teardown. */
export const MAX_MISSED_JSON_HEARTBEATS = 3;

/** Fallback when no inbound traffic at all (JSON or WS). */
export const INBOUND_IDLE_TIMEOUT_MS = 35_000;

export const CONNECTION_HEALTH_SWEEP_MS = 5_000;
