import { describe, expect, it } from 'vitest';
import {
  isNotBoundGateway,
  isRecoveryBlocked,
  operationalSyncBlockedHint,
  parseProxyError,
} from '../src/main/net/proxy-result';

describe('proxy-result', () => {
  it('parses recovery_in_progress from PROXY response body', () => {
    const result = parseProxyError({
      type: 'PROXY_RESPONSE',
      id: '1',
      status: 409,
      body: {
        success: false,
        code: 'recovery_in_progress',
        message: 'Gateway recovery in progress — inventory sync blocked until recovery completes or is bypassed',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('recovery_in_progress');
      expect(isRecoveryBlocked(result)).toBe(true);
    }
  });

  it('parses not_bound_gateway from PROXY response body', () => {
    const result = parseProxyError({
      type: 'PROXY_RESPONSE',
      id: '2',
      status: 403,
      body: {
        success: false,
        code: 'not_bound_gateway',
        message: 'Inventory and state sync are only accepted from the bound production gateway — complete swap recovery first',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('not_bound_gateway');
      expect(isNotBoundGateway(result)).toBe(true);
      expect(operationalSyncBlockedHint(result)).toContain('swap candidate');
    }
  });
});
