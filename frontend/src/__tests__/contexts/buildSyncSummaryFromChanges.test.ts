import { buildSyncSummaryFromChanges } from '@/contexts/FMSSyncContext';
import { FMSChangeAction, FMSChangeType, type FMSChange } from '@/types/fms.types';

function change(type: FMSChangeType, entityType: 'tenant' | 'unit' = 'tenant'): FMSChange {
  return {
    id: `chg-${type}`,
    sync_log_id: 'sync-1',
    change_type: type,
    entity_type: entityType,
    external_id: 'ext-1',
    after_data: {},
    required_actions: [FMSChangeAction.UPDATE_USER],
    impact_summary: 'test',
    is_reviewed: false,
    created_at: new Date().toISOString(),
  };
}

describe('buildSyncSummaryFromChanges', () => {
  it('counts tenant and unit change types into the sync summary', () => {
    const summary = buildSyncSummaryFromChanges([
      change(FMSChangeType.TENANT_ADDED),
      change(FMSChangeType.TENANT_ADDED),
      change(FMSChangeType.TENANT_REMOVED),
      change(FMSChangeType.TENANT_UPDATED),
      change(FMSChangeType.UNIT_ADDED),
      change(FMSChangeType.UNIT_REMOVED),
      change(FMSChangeType.UNIT_UPDATED),
      change(FMSChangeType.UNIT_OVERLOCK_CHANGED),
    ]);

    expect(summary).toEqual({
      tenantsAdded: 2,
      tenantsRemoved: 1,
      tenantsUpdated: 1,
      unitsAdded: 1,
      unitsRemoved: 1,
      unitsUpdated: 1,
      errors: [],
      warnings: [],
    });
  });

  it('returns zeros for an empty change list', () => {
    expect(buildSyncSummaryFromChanges([])).toEqual({
      tenantsAdded: 0,
      tenantsRemoved: 0,
      tenantsUpdated: 0,
      unitsAdded: 0,
      unitsRemoved: 0,
      unitsUpdated: 0,
      errors: [],
      warnings: [],
    });
  });
});
