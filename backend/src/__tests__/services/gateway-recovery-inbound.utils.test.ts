import {
  isRecoveryInboundWsType,
  validateRecoveryInboundSession,
} from '@/utils/gateway-recovery-inbound.utils';

describe('gateway-recovery-inbound.utils', () => {
  it('identifies recovery inbound WS types', () => {
    expect(isRecoveryInboundWsType('INVENTORY_SNAPSHOT_STATUS')).toBe(true);
    expect(isRecoveryInboundWsType('FIRMWARE_CHUNK_ACK')).toBe(true);
    expect(isRecoveryInboundWsType('PROXY_REQUEST')).toBe(false);
  });

  it('accepts swap candidate when recovery push target is armed', () => {
    const result = validateRecoveryInboundSession({
      facilityId: 'fac-1',
      gatewayId: 'gw-new',
      sessionRole: 'swap_candidate',
      recoveryPushGatewayId: 'gw-new',
    });
    expect(result).toEqual({ accepted: true });
  });

  it('rejects active session when recovery push target is armed', () => {
    const result = validateRecoveryInboundSession({
      facilityId: 'fac-1',
      gatewayId: 'gw-old',
      sessionRole: 'active',
      recoveryPushGatewayId: 'gw-new',
    });
    expect(result.accepted).toBe(false);
    expect(result).toHaveProperty('reason');
  });

  it('allows any session when no recovery push target is armed', () => {
    const result = validateRecoveryInboundSession({
      facilityId: 'fac-1',
      gatewayId: 'gw-old',
      sessionRole: 'active',
      recoveryPushGatewayId: null,
    });
    expect(result).toEqual({ accepted: true });
  });
});
