/**
 * Regression: UNIT_UPDATED must not double-count changesApplied or swallow updateUnit errors
 * (previously applyUnitUpdated incremented result internally and caught errors while the
 * outer applyChanges still counted success + bulkMarkApplied).
 */
jest.unmock('@/services/fms/fms.service');

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { FMSChangeType } from '@/types/fms.types';
import { UserRole } from '@/types/auth.types';

describe('FMSService.applyChanges — UNIT_UPDATED accounting', () => {
  function wireMocks(svc: any) {
    const change = unitUpdatedChange();
    svc.changeModel = {
      findById: jest.fn().mockResolvedValue(change),
      findByIds: jest.fn().mockResolvedValue([change]),
      findBySyncLogId: jest.fn().mockResolvedValue([change]),
      getStatsBySyncLogId: jest.fn().mockResolvedValue({
        total: 1,
        reviewed: 1,
        pending: 0,
        accepted: 1,
        rejected: 0,
        byType: {},
      }),
      bulkMarkApplied: jest.fn().mockResolvedValue(1),
    };
    svc.syncLogModel = {
      findById: jest.fn().mockResolvedValue({
        id: 'sync-1',
        facility_id: 'fac-1',
        triggered_by_user_id: 'admin-1',
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({
        id: 'unit-int-1',
        facility_id: 'fac-1',
        unit_number: '101',
      }),
    };
    svc.entityMappingModel = {
      findByExternalId: jest.fn().mockResolvedValue({
        id: 'map-ext',
        internal_id: 'unit-int-1',
        external_id: 'ext-u',
      }),
      findByInternalId: jest.fn().mockResolvedValue({
        id: 'map-int',
        internal_id: 'unit-int-1',
        external_id: 'ext-u',
      }),
      findByFacility: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      create: jest.fn(),
    };
    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'generic_rest' }),
    };
    svc.unitsService = {
      updateUnit: jest.fn().mockResolvedValue({ status: 'updated' }),
    };
  }

  function unitUpdatedChange() {
    return {
      id: 'chg-1',
      sync_log_id: 'sync-1',
      change_type: FMSChangeType.UNIT_UPDATED,
      entity_type: 'unit' as const,
      external_id: 'ext-u',
      internal_id: 'unit-int-1',
      before_data: { status: 'available', unitType: 'storage' },
      after_data: {
        externalId: 'ext-u',
        unitNumber: '101',
        unitType: 'storage',
        status: 'occupied' as const,
      },
      required_actions: [],
      impact_summary: 'update',
      is_reviewed: true,
      is_accepted: true,
      created_at: new Date(),
    };
  }

  beforeEach(() => {
    (FMSService as any).instance = undefined;
    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts a successful UNIT_UPDATED exactly once and bulk-marks applied', async () => {
    const svc: any = FMSService.getInstance();
    wireMocks(svc);
    const appliedChange = { ...unitUpdatedChange(), applied_at: new Date() };
    svc.changeModel.findByIds.mockResolvedValue([unitUpdatedChange()]);
    svc.changeModel.findBySyncLogId.mockResolvedValue([appliedChange]);

    const result = await svc.applyChanges('sync-1', ['chg-1']);

    expect(result.changesApplied).toBe(1);
    expect(result.changesFailed).toBe(0);
    expect(svc.changeModel.bulkMarkApplied).toHaveBeenCalledWith(['chg-1']);
    expect(svc.unitsService.updateUnit).toHaveBeenCalledTimes(1);
    expect(svc.syncLogModel.update).toHaveBeenCalledWith(
      'sync-1',
      expect.objectContaining({ changes_applied: 1 }),
    );
  });

  it('does not bulkMarkApplied when updateUnit throws', async () => {
    const svc: any = FMSService.getInstance();
    wireMocks(svc);
    svc.changeModel.findById.mockResolvedValue(unitUpdatedChange());
    svc.unitsService.updateUnit.mockRejectedValue(new Error('unit update failed'));

    const result = await svc.applyChanges('sync-1', ['chg-1']);

    expect(result.changesApplied).toBe(0);
    expect(result.changesFailed).toBe(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unit_updated.*unit update failed/is),
      ]),
    );
    expect(result.errorDetails).toEqual([
      expect.objectContaining({
        changeId: 'chg-1',
        changeType: FMSChangeType.UNIT_UPDATED,
        entityType: 'unit',
        entityLabel: '101',
        message: 'unit update failed',
      }),
    ]);
    expect(svc.changeModel.bulkMarkApplied).not.toHaveBeenCalled();
    expect(svc.syncLogModel.update).toHaveBeenCalledWith(
      'sync-1',
      expect.objectContaining({ changes_applied: 0 }),
    );
  });
});
