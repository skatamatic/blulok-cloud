import {
  buildFmsPendingReviewNotification,
  collectFmsReviewProblems,
  sanitizeFmsReviewProblem,
} from '@/services/fms/fms-review-notification.utils';

describe('fms-review-notification.utils', () => {
  it('collects unique invalid-change reasons and strips opaque ids', () => {
    const collected = collectFmsReviewProblems([
      { is_valid: true, validation_errors: ['should ignore'] },
      {
        is_valid: false,
        validation_errors: [
          'Contact matches t3@blulok.com, already mapped to FMS tenant 050a871f-7607-47fc-bd7e-535efbf4d3a1. Fix the shared phone.',
        ],
      },
      {
        is_valid: 0,
        impact_summary: 'Contact matches t3@blulok.com, already mapped to FMS tenant 050a871f-7607-47fc-bd7e-535efbf4d3a1. Fix the shared phone.',
      },
    ]);

    expect(collected.invalidCount).toBe(2);
    expect(collected.problemSummaries).toHaveLength(1);
    expect(collected.problemSummaries[0]).toContain('t3@blulok.com');
    expect(collected.problemSummaries[0]).toContain('another FMS record');
    expect(collected.problemSummaries[0]).not.toContain('050a871f');
  });

  it('says automatic sync did not apply when a problem blocked the batch', () => {
    const content = buildFmsPendingReviewNotification({
      facilityName: 'BluLok HQ',
      pendingCount: 1,
      changesDetected: 1,
      changesApplied: 0,
      autoApplyAttempted: true,
      problemSummaries: [
        'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.',
      ],
      source: 'sync',
    });

    expect(content.autoApplyBlocked).toBe(true);
    expect(content.statusLabel).toBe('Automatic sync did not apply');
    expect(content.message).toContain('Automatic sync did not apply because a problem was detected');
    expect(content.message).toContain('t3@blulok.com');
    expect(content.message).toContain('Open Review changes');
  });

  it('keeps ordinary review copy when nothing is blocked and auto-apply was not attempted', () => {
    const content = buildFmsPendingReviewNotification({
      facilityName: 'BluLok HQ',
      pendingCount: 3,
      changesDetected: 3,
      autoApplyAttempted: false,
      source: 'webhook',
      eventLabel: 'Tenant move-in',
    });

    expect(content.autoApplyBlocked).toBe(false);
    expect(content.statusLabel).toBe('Needs your review');
    expect(content.message).toContain('tenant move-in');
    expect(content.message).toContain('3 changes need your review');
    expect(content.message).not.toContain('Automatic sync did not apply');
  });

  it('sanitizes leftover provider ids from problem text', () => {
    expect(
      sanitizeFmsReviewProblem('Already mapped to 27f0cbe7-b765-40db-bd59-0251f6b87293'),
    ).toBe('Already mapped to another FMS record');
  });
});
