import {
  isLoggableLockStatusTransition,
  lockActivityTitle,
  lockActivityVerb,
  mapLockStatusToActivityType,
} from '@/utils/lock-status-activity.utils';

describe('lock-status-activity.utils', () => {
  it('maps device lock_status to activity_logs activity_type', () => {
    expect(mapLockStatusToActivityType('locked')).toBe('lock');
    expect(mapLockStatusToActivityType('unlocked')).toBe('unlock');
    expect(mapLockStatusToActivityType('locking')).toBe('locking');
    expect(mapLockStatusToActivityType('unlocking')).toBe('unlocking');
    expect(mapLockStatusToActivityType('error')).toBeNull();
  });

  it('provides human-readable lock activity labels', () => {
    expect(lockActivityTitle('lock')).toBe('Device Locked');
    expect(lockActivityVerb('lock')).toBe('locked');
    expect(lockActivityVerb('unlock')).toBe('unlocked');
  });

  it('detects loggable lock transitions', () => {
    expect(isLoggableLockStatusTransition('locked')).toBe(true);
    expect(isLoggableLockStatusTransition('unknown')).toBe(false);
  });
});
