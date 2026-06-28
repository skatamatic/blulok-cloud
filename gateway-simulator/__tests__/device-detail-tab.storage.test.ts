import { describe, expect, it, vi } from 'vitest';
import { createLocalDeviceDetailTabStorage } from '../src/renderer/utils/device-detail-tab.storage';

describe('device-detail-tab.storage', () => {
  it('reads and writes tab id via localStorage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    const storage = createLocalDeviceDetailTabStorage('test.tab');
    expect(storage.read()).toBeNull();
    storage.write('security');
    expect(storage.read()).toBe('security');
    vi.unstubAllGlobals();
  });

  it('swallows localStorage errors', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    const storage = createLocalDeviceDetailTabStorage();
    expect(storage.read()).toBeNull();
    expect(() => storage.write('overview')).not.toThrow();
    vi.unstubAllGlobals();
  });
});
