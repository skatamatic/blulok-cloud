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
