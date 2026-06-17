import {
  canStartRecovery,
  deriveRecoveryProgress,
  isRecoveryBlocking,
  mergeRecoveryProgress,
  resolveStepperStepIndex,
} from '@/utils/gateway-recovery-progress.utils';
import { GatewayRecovery } from '@/types/gateway-recovery.types';

const baseRecovery: GatewayRecovery = {
  id: 'rec-1',
  facility_id: 'fac-1',
  gateway_id: 'gw-new',
  previous_gateway_id: 'gw-old',
  status: 'detected',
  firmware_id: null,
  provisioning_backup_id: null,
  inventory_snapshot_id: null,
  firmware_push_id: null,
  provisioning_restore_id: null,
  inventory_chunks_total: null,
  inventory_chunks_sent: 0,
  inventory_nonce: null,
  bypassed: false,
  error_message: null,
  initiated_by: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('gateway-recovery-progress.utils', () => {
  it('marks blocking statuses correctly', () => {
    expect(isRecoveryBlocking('inventory_push')).toBe(true);
    expect(isRecoveryBlocking('failed')).toBe(false);
  });

  it('derives inventory push percent from chunk progress', () => {
    const progress = deriveRecoveryProgress({
      ...baseRecovery,
      status: 'inventory_push',
      inventory_chunks_sent: 5,
      inventory_chunks_total: 10,
    });
    expect(progress.percent).toBe(83);
    expect(progress.message).toContain('5 of 10');
  });

  it('merges live progress without regressing percent', () => {
    const recovery = { ...baseRecovery, status: 'inventory_push' as const, inventory_chunks_sent: 8, inventory_chunks_total: 10 };
    const merged = mergeRecoveryProgress(recovery, { ...deriveRecoveryProgress(recovery), percent: 95, message: 'Live update' });
    expect(merged.percent).toBeGreaterThanOrEqual(90);
    expect(merged.message).toBe('Live update');
  });

  it('maps stepper index for configure and inventory phases', () => {
    expect(resolveStepperStepIndex('detected')).toBe(0);
    expect(resolveStepperStepIndex('firmware')).toBe(1);
    expect(resolveStepperStepIndex('inventory_push')).toBe(3);
    expect(resolveStepperStepIndex('complete')).toBe(4);
  });

  it('allows start after cancelled recovery when candidate exists', () => {
    expect(canStartRecovery({ ...baseRecovery, status: 'cancelled' }, true)).toBe(true);
    expect(canStartRecovery({ ...baseRecovery, status: 'failed' }, true)).toBe(false);
  });
});
