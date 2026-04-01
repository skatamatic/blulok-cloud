import { isBluLokLockToggleable } from '@/utils/unitLock.utils';

describe('isBluLokLockToggleable', () => {
  it('allows locked and unlocked only', () => {
    expect(isBluLokLockToggleable('locked')).toBe(true);
    expect(isBluLokLockToggleable('unlocked')).toBe(true);
    expect(isBluLokLockToggleable('locking')).toBe(false);
    expect(isBluLokLockToggleable('unlocking')).toBe(false);
    expect(isBluLokLockToggleable('error')).toBe(false);
    expect(isBluLokLockToggleable('unknown')).toBe(false);
  });
});
