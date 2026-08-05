/**
 * Real FMSService.detectTenantChanges — validates phone-only tenants during sync detection.
 */
jest.unmock('@/services/fms/fms.service');

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { FMSChangeType } from '@/types/fms.types';

describe('FMSService.detectTenantChanges — phone-only tenants', () => {
  beforeEach(() => {
    (FMSService as any).instance = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks phone-only tenant as valid and emits TENANT_ADDED', async () => {
    const svc = FMSService.getInstance() as any;

    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([]),
    };
    svc.unitAssignmentModel = {
      findByFacilityId: jest.fn().mockResolvedValue([]),
    };
    svc.changeModel = {
      bulkCreate: jest.fn().mockImplementation(async (rows: unknown[]) =>
        rows.map((row, index) => ({ id: `change-${index}`, ...(row as object) })),
      ),
    };

    jest.spyOn(UserModel, 'findByRoleMinimalForFacility').mockResolvedValue([]);

    const fmsTenants = [
      {
        externalId: 'ext-phone-1',
        email: null,
        firstName: 'Kelvin',
        lastName: 'Benjamin',
        phone: '+13450899583',
        unitIds: ['ext-unit-1'],
        status: 'active' as const,
      },
    ];

    const changes = await svc.detectTenantChanges('fac-1', fmsTenants, [], 'sync-1', [], jest.fn());

    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe(FMSChangeType.TENANT_ADDED);
    expect(changes[0].is_valid).toBe(true);
    expect(changes[0].validation_errors).toEqual([]);
    expect(changes[0].impact_summary).toContain('+13450899583');
  });

  it('matches existing phone-only user instead of creating duplicate TENANT_ADDED', async () => {
    const svc = FMSService.getInstance() as any;

    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'storedge' }),
    };
    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([]),
      ensureMapping: jest.fn().mockResolvedValue(undefined),
      findByExternalId: jest.fn().mockResolvedValue({
        id: 'map-1',
        external_id: 'ext-phone-1',
        internal_id: 'existing-phone-user',
        metadata: { phone: '+13450899583' },
      }),
    };
    svc.unitAssignmentModel = {
      findByFacilityId: jest.fn().mockResolvedValue([]),
    };
    svc.changeModel = {
      bulkCreate: jest.fn().mockImplementation(async (rows: unknown[]) =>
        rows.map((row, index) => ({ id: `change-${index}`, ...(row as object) })),
      ),
    };

    jest.spyOn(UserModel, 'findByRoleMinimalForFacility').mockResolvedValue([
      {
        id: 'existing-phone-user',
        email: null,
        phone_number: '+13450899583',
        login_identifier: '+13450899583',
        first_name: 'Kelvin',
        last_name: 'Benjamin',
      },
    ] as any);

    const fmsTenants = [
      {
        externalId: 'ext-phone-1',
        email: null,
        firstName: 'Kelvin',
        lastName: 'Benjamin',
        phone: '+13450899583',
        unitIds: [],
        status: 'active' as const,
      },
    ];

    const changes = await svc.detectTenantChanges('fac-1', fmsTenants, [], 'sync-1', [], jest.fn());

    expect(changes.filter((c: { change_type: string }) => c.change_type === FMSChangeType.TENANT_ADDED)).toHaveLength(0);
  });
});
