import { describe, expect, it } from 'vitest';
import {
  deviceMatchesCommandId,
  isLockCommandExpired,
  normalizeCommandDeviceId,
} from '../src/main/commands/lock-unlock.utils';
import type { LockInventoryItem } from '../src/protocol/device-kinds';

describe('lock-unlock.utils', () => {
  const lock: LockInventoryItem = {
    kind: 'lock',
    lock_id: 'SIM-LOCK-abc',
    state: 'CLOSED',
    locked: true,
    online: true,
  };

  it('matches device_id case-insensitively', () => {
    expect(deviceMatchesCommandId(lock, 'sim-lock-abc')).toBe(true);
    expect(deviceMatchesCommandId(lock, 'SIM-LOCK-ABC')).toBe(true);
    expect(deviceMatchesCommandId(lock, 'other')).toBe(false);
  });

  it('matches cloud_device_id targets from JWT commands', () => {
    const withCloudId = { ...lock, cloud_device_id: 'uuid-lock-99' };
    expect(deviceMatchesCommandId(withCloudId, 'uuid-lock-99')).toBe(true);
    expect(deviceMatchesCommandId(withCloudId, 'UUID-LOCK-99')).toBe(true);
  });

  it('treats expires_at=0 as one-shot (never expired)', () => {
    expect(isLockCommandExpired({ cmd_type: 'UNLOCK', device_id: 'x', expires_at: 0 })).toBe(false);
  });

  it('detects expired commands', () => {
    expect(
      isLockCommandExpired(
        { cmd_type: 'UNLOCK', device_id: 'x', expires_at: 100 },
        200,
      ),
    ).toBe(true);
  });

  it('normalizes device ids', () => {
    expect(normalizeCommandDeviceId('  ABC-123  ')).toBe('abc-123');
  });
});
