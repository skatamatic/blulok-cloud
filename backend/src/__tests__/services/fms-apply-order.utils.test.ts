import {
  getFmsChangeApplyPhase,
  getTenantUnitChangeAction,
  isFmsChangeAutoAppliable,
  isFmsChangeDismissible,
  isFmsChangePending,
  partitionChangesForAutoApply,
  resolveFmsAutoApplyOutcome,
  sortChangesForApply,
} from '@/services/fms/fms-apply-order.utils';
import { FMSChange, FMSChangeType } from '@/types/fms.types';

function change(partial: Partial<FMSChange> & Pick<FMSChange, 'id' | 'change_type'>): FMSChange {
  return {
    sync_log_id: 'sync-1',
    entity_type: 'unit',
    external_id: partial.external_id ?? partial.id,
    impact_summary: '',
    required_actions: [],
    is_reviewed: false,
    created_at: new Date().toISOString(),
    ...partial,
  } as FMSChange;
}

describe('fms-apply-order.utils', () => {
  it('sorts unassignments before unit status updates', () => {
    const unassign = change({
      id: 'c-unassign',
      change_type: FMSChangeType.TENANT_UNIT_CHANGED,
      entity_type: 'tenant',
      before_data: { action: 'unassign_unit', unitId: 'u1' },
    });
    const unitUpdate = change({
      id: 'c-unit',
      change_type: FMSChangeType.UNIT_UPDATED,
      internal_id: 'u1',
      before_data: { status: 'occupied' },
      after_data: { status: 'available', externalId: 'ext-u1' },
    });

    const sorted = sortChangesForApply([unitUpdate, unassign]);
    expect(sorted.map((c) => c.id)).toEqual(['c-unassign', 'c-unit']);
  });

  it('sorts assignments after unit updates', () => {
    const assign = change({
      id: 'c-assign',
      change_type: FMSChangeType.TENANT_UNIT_CHANGED,
      entity_type: 'tenant',
      after_data: { action: 'assign_unit', unitId: 'u1' },
    });
    const unitUpdate = change({
      id: 'c-unit',
      change_type: FMSChangeType.UNIT_UPDATED,
      internal_id: 'u1',
      after_data: { status: 'available', externalId: 'ext-u1' },
    });

    const sorted = sortChangesForApply([assign, unitUpdate]);
    expect(sorted.map((c) => c.id)).toEqual(['c-unit', 'c-assign']);
  });

  it('places unit_added before tenant_unit assign', () => {
    const unitAdd = change({ id: 'c-add', change_type: FMSChangeType.UNIT_ADDED });
    const assign = change({
      id: 'c-assign',
      change_type: FMSChangeType.TENANT_UNIT_CHANGED,
      entity_type: 'tenant',
      after_data: { action: 'assign_unit', unitId: 'u1' },
    });
    expect(sortChangesForApply([assign, unitAdd]).map((c) => c.id)).toEqual(['c-add', 'c-assign']);
  });

  it('detects tenant unit change actions', () => {
    const unassign = change({
      id: 'x',
      change_type: FMSChangeType.TENANT_UNIT_CHANGED,
      before_data: { action: 'unassign_unit' },
    });
    expect(getTenantUnitChangeAction(unassign)).toBe('unassign_unit');
    expect(getFmsChangeApplyPhase(unassign)).toBeLessThan(
      getFmsChangeApplyPhase(
        change({
          id: 'u',
          change_type: FMSChangeType.UNIT_UPDATED,
          after_data: { status: 'available' },
        }),
      ),
    );
  });

  describe('isFmsChangePending', () => {
    it('includes unreviewed and accepted-but-not-applied changes', () => {
      expect(isFmsChangePending({ applied_at: null, is_reviewed: false })).toBe(true);
      expect(
        isFmsChangePending({ applied_at: null, is_reviewed: true, is_accepted: true }),
      ).toBe(true);
    });

    it('excludes applied and rejected changes', () => {
      expect(isFmsChangePending({ applied_at: new Date(), is_reviewed: true, is_accepted: true })).toBe(
        false,
      );
      expect(isFmsChangePending({ applied_at: null, is_reviewed: true, is_accepted: false })).toBe(
        false,
      );
    });

    it('treats MySQL 0/1 review flags as booleans', () => {
      expect(isFmsChangePending({ applied_at: null, is_reviewed: 1, is_accepted: 0 })).toBe(false);
      expect(
        isFmsChangePending({ applied_at: null, is_reviewed: 1, is_accepted: 1 }),
      ).toBe(true);
    });
  });

  describe('isFmsChangeDismissible', () => {
    it('identifies invalid and failed applies', () => {
      expect(isFmsChangeDismissible({ is_valid: false })).toBe(true);
      expect(isFmsChangeDismissible({ is_reviewed: true, is_accepted: true })).toBe(true);
      expect(isFmsChangeDismissible({ is_reviewed: false, is_valid: true })).toBe(false);
      expect(isFmsChangeDismissible({ applied_at: new Date(), is_valid: false })).toBe(false);
    });

    it('treats MySQL 0/1 review flags as booleans', () => {
      expect(isFmsChangeDismissible({ is_reviewed: 1, is_accepted: 1 })).toBe(true);
      expect(isFmsChangeDismissible({ is_valid: 0 })).toBe(true);
    });
  });

  describe('auto-apply partitioning', () => {
    it('excludes invalid changes from auto-apply batch', () => {
      const changes = [
        { id: '1', is_valid: true },
        { id: '2', is_valid: false },
        { id: '3', is_valid: 0 },
      ];
      expect(isFmsChangeAutoAppliable(changes[0]!)).toBe(true);
      expect(isFmsChangeAutoAppliable(changes[1]!)).toBe(false);
      const { autoAppliable, manualReview } = partitionChangesForAutoApply(changes);
      expect(autoAppliable.map((c) => c.id)).toEqual(['1']);
      expect(manualReview.map((c) => c.id)).toEqual(['2', '3']);
    });

    it('requires review when pending rows remain after auto-apply', () => {
      const outcome = resolveFmsAutoApplyOutcome({
        totalChanges: 3,
        applyResult: { changesApplied: 1, changesFailed: 1, errors: ['boom'] },
        pendingCount: 2,
      });
      expect(outcome.requiresReview).toBe(true);
      expect(outcome.autoApplied).toBe(false);
      expect(outcome.pendingCount).toBe(2);
    });

    it('marks fully auto-applied batch as autoApplied', () => {
      const outcome = resolveFmsAutoApplyOutcome({
        totalChanges: 2,
        applyResult: { changesApplied: 2, changesFailed: 0, errors: [] },
        pendingCount: 0,
      });
      expect(outcome.autoApplied).toBe(true);
      expect(outcome.requiresReview).toBe(false);
    });
  });
});
