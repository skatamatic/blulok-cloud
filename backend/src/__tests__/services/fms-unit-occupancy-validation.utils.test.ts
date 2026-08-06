import {
  buildFmsOccupancyContext,
  isFmsUnitVacantStatus,
  partitionTenantUnitIdsByOccupancy,
  resolveLedgerAssignAgainstUnitStatus,
  resolveLedgerUnassignAgainstUnitStatus,
  resolveOccupiedUnitBlockers,
  formatVacantUnitLedgerConflictNote,
} from '@/services/fms/fms-unit-occupancy-validation.utils';
import { FMSChangeType, FMSTenant } from '@/types/fms.types';

function tenant(overrides: Partial<FMSTenant> & { externalId: string }): FMSTenant {
  return {
    email: null,
    firstName: null,
    lastName: null,
    unitIds: [],
    status: 'active',
    ...overrides,
  };
}

function invalidTenantAdded(externalId: string, errors: string[]) {
  return {
    change_type: FMSChangeType.TENANT_ADDED,
    external_id: externalId,
    is_valid: false,
    validation_errors: errors,
  };
}

describe('resolveOccupiedUnitBlockers', () => {
  const emptyContext = buildFmsOccupancyContext({
    fmsTenants: [],
    tenantChanges: [],
    mappedTenantExternalIds: [],
  });

  it('allows non-occupied FMS statuses through', () => {
    expect(
      resolveOccupiedUnitBlockers({ unitNumber: '101', status: 'available' }, 'occupied', emptyContext),
    ).toEqual([]);
  });

  it('allows occupied when the unit already reads as occupied in BluLok', () => {
    expect(
      resolveOccupiedUnitBlockers({ unitNumber: '101', status: 'occupied' }, 'occupied', emptyContext),
    ).toEqual([]);
    expect(
      resolveOccupiedUnitBlockers({ unitNumber: '101', status: 'occupied' }, 'overlocked', emptyContext),
    ).toEqual([]);
  });

  it('blocks occupied with no tenant named by FMS', () => {
    const [blocker] = resolveOccupiedUnitBlockers(
      { unitNumber: '908', status: 'occupied' },
      'available',
      emptyContext,
    );

    expect(blocker).toContain('unit 908');
    expect(blocker).toContain('does not say which tenant holds it');
  });

  it('allows occupied when the FMS tenant is already a BluLok user', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', email: 'june.mary@yopmail.com' })],
      tenantChanges: [],
      mappedTenantExternalIds: ['fms-tenant-1'],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '806', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      ),
    ).toEqual([]);
  });

  it('allows occupied when the FMS tenant will be created in the same batch', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', email: 'new.tenant@yopmail.com', firstName: 'New', lastName: 'Tenant' })],
      tenantChanges: [
        { change_type: FMSChangeType.TENANT_ADDED, external_id: 'fms-tenant-1', is_valid: true },
      ],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '806', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      ),
    ).toEqual([]);
  });

  it('blocks occupied when the holding tenant cannot be created, naming tenant and reason', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', firstName: 'Lucien', lastName: 'Robel' })],
      tenantChanges: [invalidTenantAdded('fms-tenant-1', ['Missing or empty first name'])],
      mappedTenantExternalIds: [],
    });

    const blockers = resolveOccupiedUnitBlockers(
      { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-1' },
      'available',
      ctx,
    );

    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('Unit 908');
    expect(blockers[0]).toContain('Lucien Robel');
    expect(blockers[0]).toContain('Missing or empty first name');
    expect(blockers[0]).toContain('Fix the tenant record in your FMS');
    expect(blockers[0]).not.toContain('fms-tenant-1');
  });

  it('does not block occupied when tenant_added is a valid no-contact placeholder', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [
        tenant({
          externalId: 'fms-tenant-1',
          firstName: 'Lucien',
          lastName: 'Robel',
          email: null,
          phone: undefined,
        }),
      ],
      tenantChanges: [
        { change_type: FMSChangeType.TENANT_ADDED, external_id: 'fms-tenant-1', is_valid: true },
      ],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      ),
    ).toEqual([]);
  });

  it('falls back to a generic reason when the invalid tenant row carries no errors', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', firstName: 'Jacinda', lastName: 'Huel' })],
      tenantChanges: [
        { change_type: FMSChangeType.TENANT_ADDED, external_id: 'fms-tenant-1', is_valid: false },
      ],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '109', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      )[0],
    ).toContain('Tenant record is incomplete');
  });

  it('treats MySQL 0 as an invalid tenant row', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', firstName: 'Lucien', lastName: 'Robel' })],
      tenantChanges: [
        {
          change_type: FMSChangeType.TENANT_ADDED,
          external_id: 'fms-tenant-1',
          is_valid: 0 as unknown as boolean,
          validation_errors: ['Missing or empty first name'],
        },
      ],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      ),
    ).toHaveLength(1);
  });

  it('blocks occupied when the holding tenant is missing from the FMS tenant list', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [],
      tenantChanges: [],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-ghost' },
        'available',
        ctx,
      )[0],
    ).toContain('missing from the FMS tenant list');
  });

  it('does not flag unknown tenants for webhook batches, which only see one event', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [],
      tenantChanges: [],
      mappedTenantExternalIds: [],
      treatUnknownTenantAsBlocker: false,
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-ghost' },
        'available',
        ctx,
      ),
    ).toEqual([]);
  });

  it('labels tenants by contact when the name is missing', () => {
    const ctx = buildFmsOccupancyContext({
      fmsTenants: [tenant({ externalId: 'fms-tenant-1', email: 'nameless@yopmail.com' })],
      tenantChanges: [invalidTenantAdded('fms-tenant-1', ['Missing or empty first name'])],
      mappedTenantExternalIds: [],
    });

    expect(
      resolveOccupiedUnitBlockers(
        { unitNumber: '908', status: 'occupied', tenantId: 'fms-tenant-1' },
        'available',
        ctx,
      )[0],
    ).toContain('nameless@yopmail.com');
  });
});

describe('ledger vs unit-status conflicts (unit status is SoT)', () => {
  it('treats available/vacant/maintenance/reserved as vacant for occupancy', () => {
    expect(isFmsUnitVacantStatus('available')).toBe(true);
    expect(isFmsUnitVacantStatus('vacant')).toBe(true);
    expect(isFmsUnitVacantStatus('maintenance')).toBe(true);
    expect(isFmsUnitVacantStatus('reserved')).toBe(true);
    expect(isFmsUnitVacantStatus('occupied')).toBe(false);
  });

  it('blocks ledger assign when FMS unit status is vacant', () => {
    const [blocker] = resolveLedgerAssignAgainstUnitStatus({
      unitNumber: '101',
      fmsUnitStatus: 'available',
      tenant: tenant({
        externalId: 't1',
        firstName: 'June',
        lastName: 'Marry',
        email: 'june.mary@yopmail.com',
      }),
    });

    expect(blocker).toContain('unit 101');
    expect(blocker).toContain('vacant');
    expect(blocker).toContain('June Marry');
    expect(blocker).toContain('source of truth');
    expect(blocker).not.toContain('t1');
  });

  it('allows ledger assign when FMS unit is occupied', () => {
    expect(
      resolveLedgerAssignAgainstUnitStatus({
        unitNumber: '104',
        fmsUnitStatus: 'occupied',
        tenant: tenant({ externalId: 't1', email: 'june.mary@yopmail.com' }),
      }),
    ).toEqual([]);
  });

  it('blocks ledger unassign when FMS unit is still occupied by that tenant', () => {
    const [blocker] = resolveLedgerUnassignAgainstUnitStatus({
      unitNumber: '104',
      fmsUnitStatus: 'occupied',
      fmsUnitTenantId: 't1',
      tenantExternalId: 't1',
      tenant: tenant({ externalId: 't1', firstName: 'June', lastName: 'Marry', email: 'june.mary@yopmail.com' }),
    });

    expect(blocker).toContain('occupied');
    expect(blocker).toContain('June Marry');
    expect(blocker).toContain('source of truth');
  });

  it('allows ledger unassign when FMS unit is vacant', () => {
    expect(
      resolveLedgerUnassignAgainstUnitStatus({
        unitNumber: '101',
        fmsUnitStatus: 'available',
        fmsUnitTenantId: 't1',
        tenantExternalId: 't1',
        tenant: tenant({ externalId: 't1', email: 'june.mary@yopmail.com' }),
      }),
    ).toEqual([]);
  });

  it('partitions tenant unitIds into occupiable vs vacant conflicts', () => {
    const units = new Map([
      ['u-101', { externalId: 'u-101', unitNumber: '101', status: 'available' as const }],
      ['u-104', { externalId: 'u-104', unitNumber: '104', status: 'occupied' as const }],
      ['u-806', { externalId: 'u-806', unitNumber: '806', status: 'available' as const }],
    ]);

    const result = partitionTenantUnitIdsByOccupancy(['u-101', 'u-104', 'u-806', 'u-unknown'], units);

    expect(result.occupiableUnitIds).toEqual(['u-104', 'u-unknown']);
    expect(result.vacantConflicts).toEqual([
      { externalId: 'u-101', unitNumber: '101', status: 'available' },
      { externalId: 'u-806', unitNumber: '806', status: 'available' },
    ]);
  });

  it('formats a vacant unit_updated note when ledgers still claim tenants', () => {
    expect(formatVacantUnitLedgerConflictNote('101', ['June Marry (june.mary@yopmail.com)'])).toContain(
      'Ledger still lists June Marry',
    );
    expect(formatVacantUnitLedgerConflictNote('101', [])).toBeNull();
  });
});
