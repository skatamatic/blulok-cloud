import {
  describeFmsUpdatePushStatusFromMetadata,
  describeFmsUpdatePushSubjectFromMetadata,
  getFmsSyncReviewDetailRows,
  normalizeFmsUpdatePushMessage,
} from '@/utils/fms-update-push-notification.utils';

describe('fms-update-push-notification.utils', () => {
  it('hides a stored UUID subject from existing notifications', () => {
    expect(
      describeFmsUpdatePushSubjectFromMetadata({
        subjectLabel: 'Unit f1c0acb8-3cd8-49ac-8cf7-102eaac7633a',
        payload: { unit_id: 'f1c0acb8-3cd8-49ac-8cf7-102eaac7633a' },
      }),
    ).toBeUndefined();
  });

  it('uses a mapped unit number when present', () => {
    expect(
      describeFmsUpdatePushSubjectFromMetadata({
        payload: {
          unit_id: 'f1c0acb8-3cd8-49ac-8cf7-102eaac7633a',
          unit_number: 'WS-01',
          first_name: 'Jane',
          last_name: 'Doe',
        },
      }),
    ).toBe('Jane Doe · Unit WS-01');
  });

  it('strips a UUID unit parenthetical from legacy message copy', () => {
    expect(
      normalizeFmsUpdatePushMessage(
        'BluLok HQ received a tenant move-in update from your property management system. Changes were applied automatically. (Unit f1c0acb8-3cd8-49ac-8cf7-102eaac7633a)',
      ),
    ).toBe(
      'BluLok HQ received a tenant move-in update from your property management system. Changes were applied automatically.',
    );
  });

  it('labels blocked auto-apply as automatic sync did not apply', () => {
    expect(
      describeFmsUpdatePushStatusFromMetadata({
        autoApplyBlocked: true,
        requiresReview: true,
        changesDetected: 3,
        changesApplied: 0,
      }),
    ).toBe('Automatic sync did not apply');
  });

  it('includes problem and next-step rows for a blocked full sync', () => {
    const rows = getFmsSyncReviewDetailRows({
      autoApplyBlocked: true,
      requiresReview: true,
      pendingCount: 1,
      statusLabel: 'Automatic sync did not apply',
      problemSummaries: ['Shared phone matches an already-mapped tenant.'],
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Status', value: 'Automatic sync did not apply' }),
        expect.objectContaining({ label: 'Problem', value: 'Shared phone matches an already-mapped tenant.' }),
        expect.objectContaining({ label: 'Next step', value: expect.stringContaining('Review changes') }),
      ]),
    );
  });
});
