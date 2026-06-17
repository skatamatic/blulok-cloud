import type { GatewaySessionRole } from '@/services/gateway/message-types';

/** WS message types that affect recovery push state and must come from the swap candidate. */
export const RECOVERY_INBOUND_WS_TYPES = new Set([
  'FIRMWARE_CHUNK_ACK',
  'FIRMWARE_UPDATE_STATUS',
  'FIRMWARE_PROGRESS',
  'PROVISIONING_CHUNK_ACK',
  'PROVISIONING_RESTORE_STATUS',
  'INVENTORY_SNAPSHOT_CHUNK_ACK',
  'INVENTORY_SNAPSHOT_STATUS',
]);

export function isRecoveryInboundWsType(type: string): boolean {
  return RECOVERY_INBOUND_WS_TYPES.has(type);
}

export interface RecoveryInboundSessionCheck {
  facilityId: string;
  gatewayId?: string;
  sessionRole: GatewaySessionRole;
  recoveryPushGatewayId?: string | null;
}

export function validateRecoveryInboundSession(
  check: RecoveryInboundSessionCheck,
): { accepted: true } | { accepted: false; reason: string } {
  const pushTarget = check.recoveryPushGatewayId;
  if (!pushTarget) {
    return { accepted: true };
  }
  if (check.sessionRole !== 'swap_candidate') {
    return { accepted: false, reason: 'recovery inbound message requires swap candidate session' };
  }
  if (!check.gatewayId || check.gatewayId !== pushTarget) {
    return { accepted: false, reason: 'recovery inbound message gateway id mismatch' };
  }
  return { accepted: true };
}
