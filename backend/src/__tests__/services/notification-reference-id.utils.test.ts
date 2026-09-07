import { createHash } from 'crypto';
import {
  capNotificationReferenceId,
  NOTIFICATION_REFERENCE_ID_MAX_LENGTH,
} from '@/services/notifications/notification-reference-id.utils';

describe('capNotificationReferenceId', () => {
  it('passes through short ids', () => {
    expect(capNotificationReferenceId('unit-1')).toBe('unit-1');
  });

  it('hashes values longer than the column width', () => {
    const path = '/api/v1/users/0dcbd690-d60c-4383-9ecb-e3417e5f15aa/resend-invite';
    expect(path.length).toBeGreaterThan(NOTIFICATION_REFERENCE_ID_MAX_LENGTH);
    const capped = capNotificationReferenceId(path);
    expect(capped).toBe(createHash('sha256').update(path).digest('hex').slice(0, 32));
    expect(capped.length).toBeLessThanOrEqual(NOTIFICATION_REFERENCE_ID_MAX_LENGTH);
  });
});
