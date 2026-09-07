import { isSupersedablePendingSyncLog } from '@/services/fms/fms-sync-cleanup.utils';

describe('isSupersedablePendingSyncLog', () => {
  it('keeps webhook review batches', () => {
    expect(isSupersedablePendingSyncLog({ triggered_by: 'webhook' })).toBe(false);
  });

  it('supersedes manual and automatic review batches', () => {
    expect(isSupersedablePendingSyncLog({ triggered_by: 'manual' })).toBe(true);
    expect(isSupersedablePendingSyncLog({ triggered_by: 'automatic' })).toBe(true);
  });
});
