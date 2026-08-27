import {
  describeFmsUpdatePushSubjectFromMetadata,
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
});
