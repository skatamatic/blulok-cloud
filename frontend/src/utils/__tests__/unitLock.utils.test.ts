import {
  canRequestRemoteUnlock,
  canRequestRemoteLock,
  canUseRemoteUnlockControls,
  canExecuteRemoteUnlock,
  getRemoteUnlockDisabledReason,
  isDeviceReachableForRemoteUnlock,
  isLockTransitionPending,
} from '@/utils/unitLock.utils';

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

describe('canUseRemoteUnlockControls', () => {
  it('allows staff roles used by dashboard unlock surfaces', () => {
    expect(canUseRemoteUnlockControls('admin')).toBe(true);
    expect(canUseRemoteUnlockControls('maintenance')).toBe(true);
    expect(canUseRemoteUnlockControls('tenant')).toBe(false);
    expect(canUseRemoteUnlockControls(undefined)).toBe(false);
  });
});

describe('isDeviceReachableForRemoteUnlock', () => {
  it('allows online and low_battery', () => {
    expect(isDeviceReachableForRemoteUnlock('online')).toBe(true);
    expect(isDeviceReachableForRemoteUnlock('low_battery')).toBe(true);
    expect(isDeviceReachableForRemoteUnlock(undefined)).toBe(true);
  });

  it('blocks offline, error, and maintenance', () => {
    expect(isDeviceReachableForRemoteUnlock('offline')).toBe(false);
    expect(isDeviceReachableForRemoteUnlock('error')).toBe(false);
    expect(isDeviceReachableForRemoteUnlock('maintenance')).toBe(false);
  });
});

describe('getRemoteUnlockDisabledReason', () => {
  it('returns null when unlock is allowed', () => {
    expect(
      getRemoteUnlockDisabledReason({
        hasDevice: true,
        remoteSupported: true,
        lockStatus: 'locked',
        deviceStatus: 'online',
      }),
    ).toBeNull();
  });

  it('explains missing device and offline state', () => {
    expect(getRemoteUnlockDisabledReason({ hasDevice: false })).toBe(
      'No BluLok device linked',
    );
    expect(
      getRemoteUnlockDisabledReason({
        hasDevice: true,
        lockStatus: 'locked',
        deviceStatus: 'offline',
      }),
    ).toBe('Device is offline');
  });

  it('blocks unlocked and in-progress states', () => {
    expect(
      getRemoteUnlockDisabledReason({ hasDevice: true, lockStatus: 'unlocked', deviceStatus: 'online' }),
    ).toBe('Already unlocked');
    expect(
      getRemoteUnlockDisabledReason({
        hasDevice: true,
        lockStatus: 'unlocking',
        deviceStatus: 'online',
        isSubmitting: true,
      }),
    ).toBe('Unlock in progress');
  });
});

describe('canExecuteRemoteUnlock', () => {
  it('mirrors getRemoteUnlockDisabledReason', () => {
    expect(
      canExecuteRemoteUnlock({
        hasDevice: true,
        lockStatus: 'locked',
        deviceStatus: 'online',
      }),
    ).toBe(true);
    expect(
      canExecuteRemoteUnlock({
        hasDevice: true,
        lockStatus: 'locked',
        deviceStatus: 'offline',
      }),
    ).toBe(false);
  });
});
