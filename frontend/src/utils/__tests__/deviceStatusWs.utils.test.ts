import { shouldRefreshDeviceListForPayload } from '@/utils/deviceStatusWs.utils';

describe('shouldRefreshDeviceListForPayload', () => {
  const ids = new Set(['a', 'b']);

  it('returns true when relevantIds is empty (initial / unknown)', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, new Set())).toBe(true);
  });

  it('matches updatedDeviceId', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'a' }, ids)).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, ids)).toBe(false);
  });

  it('matches any id in devices array', () => {
    expect(
      shouldRefreshDeviceListForPayload({ devices: [{ id: 'b' }, { id: 'z' }] }, ids)
    ).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ devices: [{ id: 'z' }] }, ids)).toBe(false);
  });

  it('returns true when payload has no id hints (conservative)', () => {
    expect(shouldRefreshDeviceListForPayload({}, ids)).toBe(true);
  });
});
