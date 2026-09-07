import { describe, expect, it } from 'vitest';
import {
  applyDenylistAdd,
  applyDenylistRemove,
  applyAccessCodesForDevice,
  cloneSimState,
  createDefaultDeviceSimState,
  isDenylistBlocked,
  rotateDeviceOperationsKey,
  stripLegacySimFields,
} from '../src/main/devices/device-simulator.utils';

describe('device-simulator.utils', () => {
  it('creates default sim state with facility id and public trust keys only', () => {
    const sim = createDefaultDeviceSimState('fac-1', 'lock', 'ops-key');
    expect(sim.facilityId).toBe('fac-1');
    expect(sim.operationsKeyPublicB64).toBe('ops-key');
    expect(sim.rootKeyPublicB64.length).toBeGreaterThan(10);
    expect(sim).not.toHaveProperty('rootKeyPrivateB64');
    expect(sim.denylist).toEqual([]);
  });

  it('strips legacy rootKeyPrivateB64 when cloning persisted sim state', () => {
    const sim = createDefaultDeviceSimState('fac-1', 'lock');
    const legacy = { ...sim, rootKeyPrivateB64: 'legacy-private-should-drop' };
    const cloned = cloneSimState(legacy);
    expect(cloned).not.toHaveProperty('rootKeyPrivateB64');
    expect(stripLegacySimFields(legacy)).not.toHaveProperty('rootKeyPrivateB64');
  });

  it('applies denylist add and remove', () => {
    const sim = createDefaultDeviceSimState('fac-1', 'lock');
    applyDenylistAdd(sim, [{ sub: 'user-1', exp: 9999999999 }]);
    expect(sim.denylist).toHaveLength(1);
    expect(isDenylistBlocked(sim, 'user-1')).toBe(true);
    applyDenylistRemove(sim, [{ sub: 'user-1' }]);
    expect(sim.denylist).toHaveLength(0);
  });

  it('stores access codes from cloud push', () => {
    const sim = createDefaultDeviceSimState('fac-1', 'access_control');
    applyAccessCodesForDevice(sim, [{ code: '1234', valid_until: '2099-01-01T00:00:00Z' }], 'nonce-1');
    expect(sim.accessCodes).toHaveLength(1);
    expect(sim.lastAccessCodeNonce).toBe('nonce-1');
  });

  it('rotates operations key with timestamp', () => {
    const sim = createDefaultDeviceSimState('fac-1', 'lock', 'old-key');
    rotateDeviceOperationsKey(sim, 'new-key', 1_700_000_000);
    expect(sim.operationsKeyPublicB64).toBe('new-key');
    expect(sim.operationsKeyRotatedAt).toBeTruthy();
  });
});
