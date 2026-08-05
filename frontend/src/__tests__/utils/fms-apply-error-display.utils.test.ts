import { formatFmsApplyFailureToast } from '@/utils/fms-apply-error-display.utils';
import {
  FMSChangeApplicationResult,
  FMSChangeType,
  FMSApplyErrorDetail,
} from '@/types/fms.types';

function baseResult(
  overrides: Partial<FMSChangeApplicationResult> = {},
): FMSChangeApplicationResult {
  return {
    success: false,
    changesApplied: 0,
    changesFailed: 0,
    errors: [],
    errorDetails: [],
    accessChanges: {
      usersCreated: [],
      usersDeactivated: [],
      accessGranted: [],
      accessRevoked: [],
    },
    ...overrides,
  };
}

function unitDetail(
  overrides: Partial<FMSApplyErrorDetail> & Pick<FMSApplyErrorDetail, 'changeId' | 'message' | 'entityLabel'>,
): FMSApplyErrorDetail {
  return {
    changeType: FMSChangeType.UNIT_UPDATED,
    entityType: 'unit',
    externalId: '8a3a253e-fa5e-40a3-a730-70dee60c3e9d',
    ...overrides,
  };
}

describe('formatFmsApplyFailureToast', () => {
  it('groups unit update failures by humanized reason with counts', () => {
    const details = [
      ...Array.from({ length: 22 }, (_, i) =>
        unitDetail({
          changeId: `c-${i}`,
          entityLabel: `U-${i}`,
          message:
            'Cannot change unit status while tenants are assigned. Remove all tenants first.',
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        unitDetail({
          changeId: `o-${i}`,
          entityLabel: `O-${i}`,
          message:
            'Cannot set unit to occupied without a tenant assignment. Assign a tenant first.',
        }),
      ),
    ];

    const toast = formatFmsApplyFailureToast(
      baseResult({ changesFailed: 26, errorDetails: details }),
      30,
    );

    expect(toast.title).toBe('Apply Failed');
    expect(toast.toastType).toBe('error');
    expect(toast.message).toContain('30 changes couldn’t be applied');
    expect(toast.message).toContain('26 unit updates failed');
    expect(toast.message).toContain("22 can't change status while tenants are assigned");
    expect(toast.message).toContain('4 need a tenant before marking occupied');
    expect(toast.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(toast.message).not.toContain('unit_updated');
  });

  it('includes applied count for partial success', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesApplied: 4,
        changesFailed: 2,
        errorDetails: [
          unitDetail({
            changeId: '1',
            entityLabel: 'A-101',
            message: 'Cannot change unit status while tenants are assigned. Remove all tenants first.',
          }),
          unitDetail({
            changeId: '2',
            entityLabel: 'B-204',
            message: 'Cannot change unit status while tenants are assigned. Remove all tenants first.',
          }),
        ],
      }),
      6,
    );

    expect(toast.title).toBe('Some Changes Failed');
    expect(toast.toastType).toBe('warning');
    expect(toast.message).toContain('Applied 4 of 6 changes');
    expect(toast.message).toContain('Examples: A-101, B-204');
  });

  it('falls back when only legacy error strings are present', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesFailed: 2,
        errors: [
          'Failed to apply unit_updated for 8a3a253e-fa5e-40a3-a730-70dee60c3e9d: Cannot change unit status while tenants are assigned. Remove all tenants first.',
          'Failed to apply unit_updated for bbbbbbbb-fa5e-40a3-a730-70dee60c3e9d: Cannot change unit status while tenants are assigned. Remove all tenants first.',
        ],
      }),
      2,
    );

    expect(toast.message).toContain('2 unit updates failed');
    expect(toast.message).toContain("can't change status while tenants are assigned");
    expect(toast.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('handles empty details with a short review prompt', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({ changesApplied: 1, changesFailed: 2, errors: [] }),
      3,
    );

    expect(toast.title).toBe('Some Changes Failed');
    expect(toast.message).toContain('Applied 1 of 3 changes');
    expect(toast.message).toContain('2 changes failed to apply');
    expect(toast.message).toContain('Open the review list for details');
  });

  it('humanizes unmapped-tenant occupied failures without leaking FMS ids', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesApplied: 2,
        changesFailed: 2,
        errorDetails: [
          unitDetail({
            changeId: '1',
            entityLabel: '109',
            message:
              'Cannot mark this unit occupied because the tenant is not in BluLok yet. Create the tenant first, then retry this unit update.',
          }),
          unitDetail({
            changeId: '2',
            entityLabel: '908',
            message:
              'Cannot mark occupied: FMS tenant f128132e-9c72-4fd7-a67d-d951a611e558 is not mapped yet (apply tenant_added first)',
          }),
        ],
      }),
      4,
    );

    expect(toast.title).toBe('Some Changes Failed');
    expect(toast.message).toContain('Applied 2 of 4 changes');
    expect(toast.message).toContain("tenant isn't in BluLok yet — create the tenant first");
    expect(toast.message).toContain('Examples: 109, 908');
    expect(toast.message).not.toMatch(/f128132e|33e8bca0|tenant_added|mapped yet/i);
    // The clause already counts the failures, so the reason must not repeat it ("2 tenant isn't…").
    expect(toast.message).toContain("2 unit updates failed: tenant isn't in BluLok yet");
  });

  it('humanizes units blocked by a tenant that cannot be created', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesApplied: 0,
        changesFailed: 1,
        errorDetails: [
          unitDetail({
            changeId: '1',
            entityLabel: '908',
            message:
              'Unit 908 is occupied by Lucien Robel in FMS, but that tenant cannot be created in BluLok: Missing both email and phone number. Fix the tenant record in your FMS, then sync again.',
          }),
        ],
      }),
      1,
    );

    expect(toast.message).toContain("tenant can't be created in BluLok — fix their record in FMS");
    expect(toast.message).toContain('Examples: 908');
  });

  it('humanizes ledger vs vacant unit status conflicts', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesApplied: 0,
        changesFailed: 1,
        errorDetails: [
          unitDetail({
            changeId: '1',
            changeType: FMSChangeType.TENANT_UNIT_CHANGED,
            entityType: 'tenant',
            entityLabel: 'june.mary@yopmail.com',
            message:
              'FMS marks unit 101 as vacant, but a ledger still lists June Marry (june.mary@yopmail.com) on it. Unit status is the source of truth for occupancy, so this assignment was not applied. Fix the ledger or unit status in your FMS so they agree, then sync again.',
          }),
        ],
      }),
      1,
    );

    expect(toast.message).toContain('FMS ledger conflicts with vacant unit status — fix in FMS');
  });

  it('does not leak UUID entity labels in examples', () => {
    const toast = formatFmsApplyFailureToast(
      baseResult({
        changesFailed: 1,
        errorDetails: [
          unitDetail({
            changeId: '1',
            entityLabel: '8a3a253e-fa5e-40a3-a730-70dee60c3e9d',
            message: 'Cannot change unit status while tenants are assigned. Remove all tenants first.',
          }),
        ],
      }),
      1,
    );

    expect(toast.message).not.toContain('Examples:');
    expect(toast.message).not.toMatch(/8a3a253e/i);
  });
});
