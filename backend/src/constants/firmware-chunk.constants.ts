/** Default gateway WS max message — aligned with `websocket-gateway.transport.ts` default. */
export const GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT = 5 * 1024 * 1024;

/** Target max wire size as a fraction of the default WS limit (remaining 20% is safety margin). */
export const FIRMWARE_CHUNK_WIRE_BUDGET_RATIO = 0.8;

/**
 * Raw bytes per firmware chunk. Sized so `{ type: 'FIRMWARE_CHUNK', jwt }` stays at ~80%
 * of the default 5MB `GATEWAY_MAX_MESSAGE_BYTES` cap (~4194304 bytes on the wire).
 * Scaled 10× from the prior 512KB/235632 pairing; validated with real Ed25519 JWT signing.
 */
export const FIRMWARE_CHUNK_SIZE_BYTES = 2_356_320;
