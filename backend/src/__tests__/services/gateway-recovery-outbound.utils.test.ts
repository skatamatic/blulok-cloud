import {
  isOperationalOutboundBlockedDuringRecovery,
  isRecoveryOutboundMessage,
} from '@/utils/gateway-recovery-outbound.utils';

describe('gateway-recovery-outbound.utils', () => {
  it('identifies recovery outbound message types', () => {
    expect(isRecoveryOutboundMessage({ type: 'FIRMWARE_MANIFEST' })).toBe(true);
    expect(isRecoveryOutboundMessage({ type: 'INVENTORY_SNAPSHOT_CHUNK' })).toBe(true);
    expect(isRecoveryOutboundMessage({ type: 'INVENTORY_SNAPSHOT_RESUME' })).toBe(true);
    expect(isRecoveryOutboundMessage({ cmd_type: 'DENYLIST_ADD' })).toBe(false);
  });

  it('identifies operational messages blocked during recovery', () => {
    expect(isOperationalOutboundBlockedDuringRecovery({ cmd_type: 'ACCESS_CODE_UPDATE' })).toBe(true);
    expect(isOperationalOutboundBlockedDuringRecovery({ cmd_type: 'DENYLIST_SYNC' })).toBe(true);
    expect(isOperationalOutboundBlockedDuringRecovery({ cmd_type: 'LOCK' })).toBe(true);
    expect(isOperationalOutboundBlockedDuringRecovery({ cmd_type: 'DEVICE_DELETED' })).toBe(true);
    expect(isOperationalOutboundBlockedDuringRecovery({ type: 'FIRMWARE_CHUNK' })).toBe(false);
    expect(isOperationalOutboundBlockedDuringRecovery({ type: 'PING' })).toBe(false);
  });

  it('parses JWT cmd_type for gating', () => {
    const jwt = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCbHVDbG91ZDpSb290IiwiY21kX3R5cGUiOiJERU5ZTElTVF9BREQiLCJkZW55bGlzdF9hZGQiOlt7InN1YiI6InVzZXItMSIsImV4cCI6MTIzfV19.mock-sig';
    expect(isOperationalOutboundBlockedDuringRecovery(jwt)).toBe(true);
    expect(isRecoveryOutboundMessage(jwt)).toBe(false);
  });
});
