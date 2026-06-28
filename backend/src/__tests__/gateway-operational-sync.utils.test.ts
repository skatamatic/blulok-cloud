import { assertBoundGatewayForOperationalSync, NOT_BOUND_GATEWAY_CODE } from '@/utils/gateway-operational-sync.utils';

describe('gateway-operational-sync.utils', () => {
  it('allows requests without gateway session headers (direct API)', () => {
    expect(assertBoundGatewayForOperationalSync({})).toEqual({ allowed: true });
  });

  it('allows active session from the bound gateway', () => {
    expect(assertBoundGatewayForOperationalSync({
      sessionRole: 'active',
      requestingGatewayId: 'gw-bound',
      boundGatewayId: 'gw-bound',
    })).toEqual({ allowed: true });
  });

  it('allows legacy sessions without gateway id', () => {
    expect(assertBoundGatewayForOperationalSync({
      sessionRole: 'legacy',
    })).toEqual({ allowed: true });
  });

  it('rejects swap_candidate sessions', () => {
    const verdict = assertBoundGatewayForOperationalSync({
      sessionRole: 'swap_candidate',
      requestingGatewayId: 'gw-candidate',
      boundGatewayId: 'gw-bound',
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reject.code).toBe(NOT_BOUND_GATEWAY_CODE);
      expect(verdict.reject.status).toBe(403);
    }
  });

  it('rejects active session when gateway id does not match bound unit', () => {
    const verdict = assertBoundGatewayForOperationalSync({
      sessionRole: 'active',
      requestingGatewayId: 'gw-other',
      boundGatewayId: 'gw-bound',
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reject.code).toBe(NOT_BOUND_GATEWAY_CODE);
    }
  });
});
