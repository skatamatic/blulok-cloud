/** Ledger assign/unassign blocked when they contradict FMS unit status (SoT for occupancy) */
jest.unmock('@/services/fms/fms.service');

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { buildFmsOccupancyContext } from '@/services/fms/fms-unit-occupancy-validation.utils';
import { FMSChangeType, FMSTenant, FMSUnit } from '@/types/fms.types';

describe('FMSService.detectTenantChanges — ledger vs unit status', () => {
  beforeEach(() => {
    (FMSService as any).instance = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks assign when ledger lists a unit FMS marks vacant', async () => {
    const svc: any = FMSService.getInstance();

    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'storedge' }),
    };
    svc.entityMappingModel = {
      findByFacility: jest.fn().mockImplementation((_fac: string, entityType: string) => {
        if (entityType === 'user') {
          return Promise.resolve([
            { id: 'map-t', external_id: 'ext-tenant', internal_id: 'tenant-1', metadata: {} },
          ]);
        }
        return Promise.resolve([
          { id: 'map-101', external_id: 'ext-101', internal_id: 'unit-101' },
          { id: 'map-104', external_id: 'ext-104', internal_id: 'unit-104' },
        ]);
      }),
      ensureMapping: jest.fn(),
      findByExternalId: jest.fn(),
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
        id: 'tenant-1',
        email: 'june.mary@yopmail.com',
        first_name: 'June',
        last_name: 'Marry',
        phone_number: '+12533698565',
        login_identifier: 'june.mary@yopmail.com',
      },
    ] as any);

    const fmsTenants: FMSTenant[] = [
      {
        externalId: 'ext-tenant',
        email: 'june.mary@yopmail.com',
        firstName: 'June',
        lastName: 'Marry',
        phone: '+12533698565',
        unitIds: ['ext-101', 'ext-104'],
        status: 'active',
      },
    ];
    const fmsUnits: FMSUnit[] = [
      {
        externalId: 'ext-101',
        unitNumber: '101',
        status: 'available',
        tenantId: 'ext-tenant',
        unitType: 'Self-Storage Unit',
      },
      {
        externalId: 'ext-104',
        unitNumber: '104',
        status: 'occupied',
        tenantId: 'ext-tenant',
        unitType: 'Self-Storage Unit',
      },
    ];
    const sharedUnits = [
      { id: 'unit-101', unit_number: '101', facility_id: 'fac-1', status: 'available' },
      { id: 'unit-104', unit_number: '104', facility_id: 'fac-1', status: 'available' },
    ];

    const changes = await svc.detectTenantChanges(
      'fac-1',
      fmsTenants,
      fmsUnits,
      'sync-1',
      sharedUnits,
    );

    const assigns = changes.filter((c: any) => c.change_type === FMSChangeType.TENANT_UNIT_CHANGED);
    expect(assigns).toHaveLength(2);

    const blocked101 = assigns.find((c: any) => c.after_data?.unitNumber === '101');
    const ok104 = assigns.find((c: any) => c.after_data?.unitNumber === '104');

    expect(blocked101).toMatchObject({ is_valid: false });
    expect(blocked101.validation_errors[0]).toContain('unit 101');
    expect(blocked101.validation_errors[0]).toContain('source of truth');
    expect(blocked101.impact_summary).toContain('blocked');

    expect(ok104).toMatchObject({ is_valid: true });
    expect(ok104.validation_errors).toBeUndefined();
  });

  it('enriches vacant unit_updated impact when ledgers still claim the unit', async () => {
    const svc: any = FMSService.getInstance();
    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([
        { id: 'map-101', external_id: 'ext-101', internal_id: 'unit-101' },
      ]),
    };
    svc.changeModel = {
      bulkCreate: jest.fn().mockImplementation(async (rows: unknown[]) => rows),
    };

    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants: [],
      tenantChanges: [],
      mappedTenantExternalIds: [],
    });

    const fmsTenants: FMSTenant[] = [
      {
        externalId: 'ext-tenant',
        email: 'june.mary@yopmail.com',
        firstName: 'June',
        lastName: 'Marry',
        unitIds: ['ext-101'],
        status: 'active',
      },
    ];

    const changes = await svc.detectUnitChanges(
      'fac-1',
      [
        {
          externalId: 'ext-101',
          unitNumber: '101',
          status: 'available',
          tenantId: 'ext-tenant',
          unitType: 'Self-Storage Unit',
        },
      ],
      fmsTenants,
      'sync-1',
      [{ id: 'unit-101', unit_number: '101', unit_type: 'Self-Storage Unit', status: 'occupied' }],
      occupancyContext,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].is_valid).toBe(true);
    expect(changes[0].impact_summary).toContain('Ledger still lists');
    expect(changes[0].impact_summary).toContain('June Marry');
  });
});
