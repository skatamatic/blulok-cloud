import { canRequestRemoteUnlock, canRequestRemoteLock, isLockTransitionPending } from '@/utils/unitLock.utils';

describe('canRequestRemoteUnlock', () => {
  it('allows only locked', () => {
    expect(canRequestRemoteUnlock('locked')).toBe(true);
    expect(canRequestRemoteUnlock('unlocked')).toBe(false);
    expect(canRequestRemoteUnlock('locking')).toBe(false);
    expect(canRequestRemoteUnlock('unlocking')).toBe(false);
    expect(canRequestRemoteUnlock('error')).toBe(false);
    expect(canRequestRemoteUnlock('unknown')).toBe(false);
    expect(canRequestRemoteUnlock(undefined)).toBe(false);
  });
});

describe('canRequestRemoteLock', () => {
  it('allows only when flag is true and status is unlocked', () => {
    expect(canRequestRemoteLock('unlocked', true)).toBe(true);
    expect(canRequestRemoteLock('unlocked', false)).toBe(false);
    expect(canRequestRemoteLock('unlocked', undefined)).toBe(false);
    expect(canRequestRemoteLock('locked', true)).toBe(false);
  });
});

describe('isLockTransitionPending', () => {
  it('is true only for locking and unlocking', () => {
    expect(isLockTransitionPending('locking')).toBe(true);
    expect(isLockTransitionPending('unlocking')).toBe(true);
    expect(isLockTransitionPending('locked')).toBe(false);
    expect(isLockTransitionPending('unlocked')).toBe(false);
  });
});
