const RECOVERY_OUTBOUND_TYPES = new Set([
  'FIRMWARE_MANIFEST',
  'FIRMWARE_CHUNK',
  'FIRMWARE_PUSH_RESUME',
  'INVENTORY_SNAPSHOT_MANIFEST',
  'INVENTORY_SNAPSHOT_CHUNK',
  'INVENTORY_SNAPSHOT_RESUME',
]);

const OPERATIONAL_BLOCKED_CMD_TYPES = new Set([
  'DENYLIST_ADD',
  'DENYLIST_REMOVE',
  'DENYLIST_SYNC',
  'ACCESS_CODE_UPDATE',
  'LOCK',
  'UNLOCK',
  'DEVICE_DELETED',
]);

function extractMessageType(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.includes('.')) {
    try {
      const parts = payload.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof decoded?.cmd_type === 'string' ? decoded.cmd_type : undefined;
      }
    } catch {
      return undefined;
    }
  }

  const p = Array.isArray(payload) ? payload[0] : payload;
  if (p && typeof p === 'object') {
    const obj = p as Record<string, unknown>;
    if (typeof obj.cmd_type === 'string') return obj.cmd_type;
    if (typeof obj.type === 'string') return obj.type;
  }
  return undefined;
}

export function isRecoveryOutboundMessage(payload: unknown): boolean {
  const type = extractMessageType(payload);
  return !!type && RECOVERY_OUTBOUND_TYPES.has(type);
}

export function isOperationalOutboundBlockedDuringRecovery(payload: unknown): boolean {
  const type = extractMessageType(payload);
  if (!type) return false;
  return OPERATIONAL_BLOCKED_CMD_TYPES.has(type);
}

export function summarizeOutboundPayload(payload: unknown): { type?: string; targets?: number; format?: string } {
  if (typeof payload === 'string' && payload.includes('.')) {
    const type = extractMessageType(payload);
    return { type: type || 'JWT', format: 'JWT' };
  }
  const p = Array.isArray(payload) ? payload[0] : payload;
  const type = extractMessageType(payload);
  const targets = (p as Record<string, unknown>)?.target;
  return {
    type,
    targets: Array.isArray(targets) ? targets.length : undefined,
  };
}
