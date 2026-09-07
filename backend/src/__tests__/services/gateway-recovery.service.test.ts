import {
  BLOCKING_RECOVERY_STATUSES,
  TERMINAL_RECOVERY_STATUSES,
} from '@/models/gateway-recovery.model';
import {
  GatewayRecoveryService,
  _testBlockingFacilities,
} from '@/services/gateway/gateway-recovery.service';

describe('GatewayRecoveryService', () => {
  beforeEach(() => {
    _testBlockingFacilities.clear();
  });

  describe('bypass', () => {
    it('rejects bypass without confirm', async () => {
      await expect(
        GatewayRecoveryService.bypass('gw-new', 'fac-1', 'user-1', false),
      ).rejects.toThrow(/confirm/);
    });
  });

  describe('blocking status constants', () => {
    it('includes active recovery phases', () => {
      expect(BLOCKING_RECOVERY_STATUSES).toContain('detected');
      expect(BLOCKING_RECOVERY_STATUSES).toContain('inventory_push');
      expect(BLOCKING_RECOVERY_STATUSES).not.toContain('failed');
    });

    it('excludes terminal unblock states', () => {
      expect(BLOCKING_RECOVERY_STATUSES).not.toContain('complete');
      expect(BLOCKING_RECOVERY_STATUSES).not.toContain('bypassed');
      expect(BLOCKING_RECOVERY_STATUSES).not.toContain('cancelled');
      expect(TERMINAL_RECOVERY_STATUSES).toContain('complete');
    });
  });

  describe('blocking cache', () => {
    it('exposes sync blocking state for outbound gating', () => {
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(false);
      _testBlockingFacilities.add('fac-1');
      expect(GatewayRecoveryService.isBlockingActiveForFacilitySync('fac-1')).toBe(true);
      _testBlockingFacilities.delete('fac-1');
    });
  });
});
