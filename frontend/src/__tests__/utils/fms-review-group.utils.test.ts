import { FMSChangeType } from '@/types/fms.types';
import {
  groupFmsReviewChanges,
  presentFmsReviewGroup,
} from '@/utils/fms-review-group.utils';

function change(overrides: {
  id: string;
  change_type: FMSChangeType;
  impact_summary: string;
  validation_errors?: string[];
  is_valid?: boolean;
  after_data?: unknown;
}) {
  return {
    external_id: overrides.id,
    is_valid: false,
    after_data: {},
    ...overrides,
  };
}

describe('groupFmsReviewChanges', () => {
  it('keeps valid rows as individual cards', () => {
    const rows = [
      change({
        id: 't1',
        change_type: FMSChangeType.TENANT_UPDATED,
        impact_summary: 'Updated tenant info for: t1@blulok.com',
        is_valid: true,
      }),
    ];

    expect(groupFmsReviewChanges(rows)).toHaveLength(1);
    expect(groupFmsReviewChanges(rows)[0].kind).toBeNull();
  });

  it('collapses identity-collision tenant and unit rows onto one problem', () => {
    const rows = [
      change({
        id: 't3',
        change_type: FMSChangeType.TENANT_ADDED,
        impact_summary:
          'FMS tenant t3@blulok.com matches an existing BluLok user who is already mapped to a different FMS tenant',
        validation_errors: [
          'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.',
        ],
      }),
      change({
        id: 't2',
        change_type: FMSChangeType.TENANT_ADDED,
        impact_summary:
          'FMS tenant t2@blulok.com matches an existing BluLok user who is already mapped to a different FMS tenant',
        validation_errors: [
          'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.',
        ],
      }),
      change({
        id: 'u100',
        change_type: FMSChangeType.UNIT_UPDATED,
        impact_summary: 'Update unit 100',
        validation_errors: [
          'Unit 100 is occupied by Tester Three (t3@blulok.com) in FMS, but that tenant cannot be created in BluLok: Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.. Fix the tenant record in your FMS, then sync again.',
        ],
      }),
      change({
        id: 'u109',
        change_type: FMSChangeType.UNIT_UPDATED,
        impact_summary: 'Update unit 109',
        validation_errors: [
          'Unit 109 is occupied by Tester Two (t2@blulok.com) in FMS, but that tenant cannot be created in BluLok: Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.. Fix the tenant record in your FMS, then sync again.',
        ],
      }),
    ];

    const groups = groupFmsReviewChanges(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('identity-collision');
    expect(groups[0].changes).toHaveLength(4);
    expect(groups[0].primary.change_type).toBe(FMSChangeType.TENANT_ADDED);

    const presented = presentFmsReviewGroup(groups[0]);
    expect(presented.title).toBe('Already mapped to another FMS tenant');
    expect(presented.impact).toMatch(/t3@blulok.com/);
    expect(presented.impact).toMatch(/t2@blulok.com/);
    expect(presented.errors[0]).toMatch(/already mapped to a different FMS tenant/);
    expect(presented.relatedSummaries).toEqual(['Update unit 100', 'Update unit 109']);
  });

  it('classifies shared contacts without a unique login separately from mapped collisions', () => {
    const rows = [
      change({
        id: 't4',
        change_type: FMSChangeType.TENANT_ADDED,
        impact_summary: 'New tenant: Tester Four (t4@blulok.com)',
        validation_errors: [
          't4@blulok.com and +12504882375 are already used by other BluLok users. Each account needs a unique email or a unique phone to log in.',
        ],
      }),
    ];

    const groups = groupFmsReviewChanges(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('no-unique-login');
    expect(presentFmsReviewGroup(groups[0]).title).toBe('No unique login handle');
  });

  it('collapses vacant-ledger assigns for the same tenant', () => {
    const rows = [
      change({
        id: 'a101',
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        impact_summary: 'Assign june.mary@yopmail.com to unit 101 — blocked (FMS unit is vacant)',
        validation_errors: [
          'FMS marks unit 101 as vacant, but a ledger still lists June Marry (june.mary@yopmail.com) on it. Unit status is the source of truth for occupancy, so this assignment was not applied. Fix the ledger or unit status in your FMS so they agree, then sync again.',
        ],
        after_data: { unitNumber: '101' },
      }),
      change({
        id: 'a806',
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        impact_summary: 'Assign june.mary@yopmail.com to unit 806 — blocked (FMS unit is vacant)',
        validation_errors: [
          'FMS marks unit 806 as vacant, but a ledger still lists June Marry (june.mary@yopmail.com) on it. Unit status is the source of truth for occupancy, so this assignment was not applied. Fix the ledger or unit status in your FMS so they agree, then sync again.',
        ],
        after_data: { unitNumber: '806' },
      }),
    ];

    const groups = groupFmsReviewChanges(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('ledger-vacant');

    const presented = presentFmsReviewGroup(groups[0]);
    expect(presented.title).toBe('Unit status and ledger disagree');
    expect(presented.impact).toBe(
      'Assign june.mary@yopmail.com to units 101, 806 — blocked (FMS units are vacant)',
    );
    expect(presented.errors[0]).toContain('units 101, 806');
    expect(presented.errors[0]).toContain('these assignments were not applied');
  });

  it('titles a single incomplete-tenant card instead of using the change type', () => {
    const groups = groupFmsReviewChanges([
      change({
        id: 'nameless',
        change_type: FMSChangeType.TENANT_ADDED,
        impact_summary: 'New tenant: Unknown Unknown (placeholder — no login) - Will be added to 1 unit(s)',
        validation_errors: ['Missing or empty first name', 'Missing or empty last name'],
      }),
    ]);

    expect(groups[0].kind).toBe('incomplete-tenant');
    expect(presentFmsReviewGroup(groups[0]).title).toBe('Incomplete tenant record');
  });

  it('groups an incomplete tenant with leftover occupied unit rows for that tenant', () => {
    const groups = groupFmsReviewChanges([
      change({
        id: 'ext-tenant-1',
        change_type: FMSChangeType.TENANT_ADDED,
        impact_summary: 'New tenant: Unknown Unknown',
        validation_errors: ['Missing or empty first name'],
      }),
      change({
        id: 'unit-908',
        change_type: FMSChangeType.UNIT_UPDATED,
        impact_summary: 'Update unit 908',
        validation_errors: [
          'Unit 908 is occupied by Lucien Robel in FMS, but that tenant cannot be created in BluLok: Missing or empty first name.',
        ],
        after_data: { tenantId: 'ext-tenant-1', unitNumber: '908' },
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('incomplete-tenant');
    expect(presentFmsReviewGroup(groups[0]).relatedSummaries).toEqual(['Update unit 908']);
  });

  it('titles occupied-unit and unmapped problems without grouping unrelated units', () => {
    const groups = groupFmsReviewChanges([
      change({
        id: 'u-empty',
        change_type: FMSChangeType.UNIT_UPDATED,
        impact_summary: 'Update unit 908',
        validation_errors: [
          'FMS reports unit 908 as occupied but does not say which tenant holds it, so BluLok has nobody to grant access to.',
        ],
      }),
      change({
        id: 'u-unknown',
        change_type: FMSChangeType.UNIT_UPDATED,
        impact_summary: 'Update unit 109',
        validation_errors: [
          'FMS reports unit 109 as occupied by a tenant that is missing from the FMS tenant list, so BluLok cannot grant access.',
        ],
      }),
      change({
        id: 'move-out',
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        impact_summary: 'Move-out: unassign tenant from unit 101',
        validation_errors: ['This tenant is not mapped in BluLok yet'],
      }),
    ]);

    expect(groups).toHaveLength(3);
    expect(presentFmsReviewGroup(groups[0]).title).toBe('Occupied unit has no tenant');
    expect(presentFmsReviewGroup(groups[1]).title).toBe('Occupied unit names unknown tenant');
    expect(presentFmsReviewGroup(groups[2]).title).toBe("Tenant isn't in BluLok yet");
  });

  it('collapses occupied-ledger unassigns for the same tenant', () => {
    const rows = [
      change({
        id: 'r104',
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        impact_summary: 'Remove june.mary@yopmail.com from unit 104 — blocked (FMS unit still occupied)',
        validation_errors: [
          "FMS marks unit 104 as occupied by June Marry, but that tenant's ledger no longer lists this unit. Unit status is the source of truth for occupancy, so this removal was not applied.",
        ],
        after_data: { unitNumber: '104' },
      }),
      change({
        id: 'r105',
        change_type: FMSChangeType.TENANT_UNIT_CHANGED,
        impact_summary: 'Remove june.mary@yopmail.com from unit 105 — blocked (FMS unit still occupied)',
        validation_errors: [
          "FMS marks unit 105 as occupied by June Marry, but that tenant's ledger no longer lists this unit. Unit status is the source of truth for occupancy, so this removal was not applied.",
        ],
        after_data: { unitNumber: '105' },
      }),
    ];

    const groups = groupFmsReviewChanges(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('ledger-occupied');
    expect(presentFmsReviewGroup(groups[0]).title).toBe('Unit status and ledger disagree');
    expect(presentFmsReviewGroup(groups[0]).impact).toContain('units 104, 105');
  });

  it('hides opaque FMS ids in review copy', () => {
    const groups = groupFmsReviewChanges([
      change({
        id: 'fetch',
        change_type: FMSChangeType.UNIT_ADDED,
        impact_summary: 'Create unit 050a871f-7607-47fc-bd7e-535efbf4d3a1 from webhook',
        validation_errors: ['Could not fetch unit 050a871f-7607-47fc-bd7e-535efbf4d3a1 from FMS API'],
      }),
    ]);

    const presented = presentFmsReviewGroup(groups[0]);
    expect(presented.title).toBe('Could not load unit from FMS');
    expect(presented.impact).not.toMatch(/050a871f/);
    expect(presented.errors[0]).not.toMatch(/050a871f/);
    expect(presented.errors[0]).toContain('this record');
  });
});
