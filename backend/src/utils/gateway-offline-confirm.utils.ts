import { GATEWAY_OFFLINE_CONFIRM_CLOCK_SKEW_MS } from '@/constants/gateway-liveness.constants';
import { parseGatewayLastSeen } from '@/utils/gateway-timestamp.utils';

/**
 * True when DB `last_seen` is newer than this instance's disconnect time.
 * AUTH on any Cloud Run instance writes `last_seen`; the instance that lost
 * the socket must not persist offline / notify if another instance already
 * accepted the reconnect.
 */
export function inboundLastSeenShowsReconnectAfterDisconnect(
  lastSeen: Date | string | null | undefined,
  disconnectedAtMs: number,
  clockSkewAllowanceMs = GATEWAY_OFFLINE_CONFIRM_CLOCK_SKEW_MS,
): boolean {
  if (lastSeen == null) return false;
  const parsed = parseGatewayLastSeen(lastSeen instanceof Date ? lastSeen : String(lastSeen));
  if (!parsed) return false;
  return parsed.getTime() > disconnectedAtMs - clockSkewAllowanceMs;
}
