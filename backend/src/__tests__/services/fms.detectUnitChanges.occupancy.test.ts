/** Full-sync unit detection flags occupied statuses that could never be applied */
jest.unmock('@/services/fms/fms.service');

import { FMSService } from '@/services/fms/fms.service';
import { buildFmsOccupancyContext } from '@/services/fms/fms-unit-occupancy-validation.utils';
import { FMSChangeType, FMSTenant, FMSUnit } from '@/types/fms.types';

const facilityId = 'fac-1';

function fmsUnit(overrides: Partial<FMSUnit> = {}): FMSUnit {
  return {
    externalId: 'ext-unit-908',
    unitNumber: '908',
    unitType: 'Parking Space',
    status: 'occupied',
    tenantId: 'ext-tenant-1',
    ...overrides,
  };
}

function blulokUnit() {
  // `status` here is the effective status from the units list (available == no assignments).
  return { id: 'unit-908', unit_number: '908', unit_type: 'Parking Space', status: 'available' };
}

function fmsTenant(overrides: Partial<FMSTenant> = {}): FMSTenant {
  return {
    externalId: 'ext-tenant-1',
    email: null,
    phone: undefined,
    firstName: 'Lucien',
    lastName: 'Robel',
    unitIds: ['ext-unit-908'],
    status: 'active',
    ...overrides,
  };
}

describe('FMSService.detectUnitChanges — occupancy blockers', () => {
  function wire(svc: any) {
    svc.entityMappingModel = {
      findByFacility: jest.fn().mockResolvedValue([
        { id: 'map-908', external_id: 'ext-unit-908', internal_id: 'unit-908' },
      ]),
    };
    svc.changeModel = {
      bulkCreate: jest.fn().mockImplementation(async (rows: unknown[]) => rows),
    };
  }

  beforeEach(() => {
    (FMSService as any).instance = undefined;
  });

  it('marks the unit update invalid when its FMS tenant cannot be created', async () => {
    const svc: any = FMSService.getInstance();
    wire(svc);

    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants: [fmsTenant()],
      tenantChanges: [
        {
          change_type: FMSChangeType.TENANT_ADDED,
          external_id: 'ext-tenant-1',
          is_valid: false,
          validation_errors: ['Missing both email and phone number'],
        },
      ],
      mappedTenantExternalIds: [],
    });

    const changes = await svc.detectUnitChanges(
      facilityId,
      [fmsUnit({ unitType: 'Self-Storage Unit' })],
      [fmsTenant()],
      'sync-1',
      [blulokUnit()],
      occupancyContext,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      change_type: FMSChangeType.UNIT_UPDATED,
      internal_id: 'unit-908',
      is_valid: false,
    });
    expect(changes[0].validation_errors[0]).toContain('Lucien Robel');
    expect(changes[0].validation_errors[0]).toContain('Missing both email and phone number');
  });

  it('leaves the unit update applicable when the FMS tenant will be created in the same batch', async () => {
    const svc: any = FMSService.getInstance();
    wire(svc);

    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants: [fmsTenant({ email: 'lucien.robel@yopmail.com' })],
      tenantChanges: [
        { change_type: FMSChangeType.TENANT_ADDED, external_id: 'ext-tenant-1', is_valid: true },
      ],
      mappedTenantExternalIds: [],
    });

    const changes = await svc.detectUnitChanges(
      facilityId,
      [fmsUnit({ unitType: 'Self-Storage Unit' })],
      [fmsTenant()],
      'sync-1',
      [blulokUnit()],
      occupancyContext,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ is_valid: true });
    expect(changes[0].validation_errors).toBeUndefined();
  });

  it('does not flag vacating unit updates', async () => {
    const svc: any = FMSService.getInstance();
    wire(svc);

    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants: [],
      tenantChanges: [],
      mappedTenantExternalIds: [],
    });

    const changes = await svc.detectUnitChanges(
      facilityId,
      [fmsUnit({ status: 'available', tenantId: undefined, unitType: 'Self-Storage Unit' })],
      [],
      'sync-1',
      [{ ...blulokUnit(), status: 'occupied' }],
      occupancyContext,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ is_valid: true });
  });
});
