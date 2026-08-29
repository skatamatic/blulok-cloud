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

  it('marks no-contact tenant as valid placeholder TENANT_ADDED', async () => {
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
        externalId: 'ext-placeholder-1',
        email: null,
        firstName: 'Edythe',
        lastName: 'Orn',
        phone: null,
        unitIds: ['ext-unit-1'],
        status: 'active' as const,
      },
    ];

    const changes = await svc.detectTenantChanges('fac-1', fmsTenants, [], 'sync-1', [], jest.fn());

    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe(FMSChangeType.TENANT_ADDED);
    expect(changes[0].is_valid).toBe(true);
    expect(changes[0].validation_errors).toEqual([]);
    expect(changes[0].impact_summary).toContain('placeholder — no login');
  });

  it('emits TENANT_UPDATED when a mapped placeholder gains email only', async () => {
    const svc = FMSService.getInstance() as any;

    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([
        {
          id: 'map-ph-1',
          external_id: 'ext-placeholder-1',
          internal_id: 'placeholder-user-1',
          metadata: { email: null, phone: null },
        },
      ]),
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
        id: 'placeholder-user-1',
        email: null,
        phone_number: null,
        login_identifier: 'fms-ph:fac-1:ext-placeholder-1',
        first_name: 'Edythe',
        last_name: 'Orn',
        is_active: true,
        is_placeholder: true,
      },
    ] as any);

    const fmsTenants = [
      {
        externalId: 'ext-placeholder-1',
        email: 'edythe.orn@example.com',
        firstName: 'Edythe',
        lastName: 'Orn',
        phone: null,
        unitIds: [],
        status: 'active' as const,
      },
    ];

    const changes = await svc.detectTenantChanges('fac-1', fmsTenants, [], 'sync-1', [], jest.fn());

    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe(FMSChangeType.TENANT_UPDATED);
    expect(changes[0].is_valid).toBe(true);
    expect(changes[0].internal_id).toBe('placeholder-user-1');
    expect(changes[0].after_data.email).toBe('edythe.orn@example.com');
  });

  it('emits an invalid tenant_added when contact matches a user already mapped to another FMS tenant', async () => {
    const svc = FMSService.getInstance() as any;

    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([
        {
          id: 'map-other',
          external_id: 'ext-already-mapped',
          internal_id: 'user-t3',
          metadata: { email: 't3@example.com', phone: '+12504882375' },
        },
      ]),
      ensureMapping: jest.fn(),
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
        id: 'user-t3',
        email: 't3@example.com',
        phone_number: '+12504882375',
        login_identifier: 't3@example.com',
        first_name: 'Tester',
        last_name: 'Three',
      },
    ] as any);

    const changes = await svc.detectTenantChanges(
      'fac-1',
      [
        {
          externalId: 'ext-already-mapped',
          email: 't3@example.com',
          firstName: 'Tester',
          lastName: 'Three',
          phone: '+12504882375',
          unitIds: [],
          status: 'active' as const,
        },
        {
          externalId: 'ext-tester-two',
          email: 't2@example.com',
          firstName: 'Tester',
          lastName: 'Two',
          phone: '+12504882375',
          unitIds: [],
          status: 'active' as const,
        },
      ],
      [],
      'sync-1',
      [],
      jest.fn(),
    );

    expect(svc.entityMappingModel.ensureMapping).not.toHaveBeenCalled();
    const collision = changes.find((c: { external_id: string }) => c.external_id === 'ext-tester-two');
    expect(collision?.change_type).toBe(FMSChangeType.TENANT_ADDED);
    expect(collision?.is_valid).toBe(false);
    expect(collision?.validation_errors?.[0]).toMatch(/already mapped to a different FMS tenant/);
    expect(collision?.validation_errors?.[0]).toMatch(/unique email or phone/);
  });
});
