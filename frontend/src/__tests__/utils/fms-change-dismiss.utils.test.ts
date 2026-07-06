import { FMSChangeType } from '@/types/fms.types';
import {
  countDismissibleChanges,
  getDismissibleChangeIds,
  isFmsChangeDismissible,
} from '@/utils/fms-change-dismiss.utils';
import { FMSChange } from '@/types/fms.types';

function change(overrides: Partial<FMSChange>): FMSChange {
  return {
    id: 'c1',
    sync_log_id: 'sync-1',
    change_type: FMSChangeType.UNIT_ADDED,
    entity_type: 'unit',
    external_id: 'ext-1',
    after_data: {},
    required_actions: [],
    impact_summary: 'test',
    is_reviewed: false,
    is_valid: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('fms-change-dismiss.utils', () => {
  it('treats invalid pending changes as dismissible', () => {
    expect(isFmsChangeDismissible(change({ is_valid: false }))).toBe(true);
  });

  it('treats accepted-but-unapplied changes as dismissible', () => {
    expect(
      isFmsChangeDismissible(
        change({ is_reviewed: true, is_accepted: true, applied_at: undefined }),
      ),
    ).toBe(true);
  });

  it('does not dismiss fresh valid changes awaiting first apply', () => {
    expect(isFmsChangeDismissible(change({ is_reviewed: false, is_valid: true }))).toBe(false);
  });

  it('does not dismiss applied changes', () => {
    expect(isFmsChangeDismissible(change({ applied_at: new Date().toISOString() }))).toBe(false);
  });

  it('counts and collects dismissible ids', () => {
    const changes = [
      change({ id: 'invalid', is_valid: false }),
      change({ id: 'fresh', is_reviewed: false }),
      change({ id: 'failed', is_reviewed: true, is_accepted: true }),
    ];
    expect(countDismissibleChanges(changes)).toBe(2);
    expect(getDismissibleChangeIds(changes)).toEqual(['invalid', 'failed']);
  });
});
