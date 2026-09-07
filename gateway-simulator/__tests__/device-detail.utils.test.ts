import { describe, expect, it } from 'vitest';
import {
  deviceDetailTabsForKind,
  isDeviceDetailTabId,
  normalizeDeviceDetailTab,
  readDeviceDetailTab,
  writeDeviceDetailTab,
} from '../src/renderer/utils/device-detail.utils';

describe('device-detail.utils', () => {
  it('includes simulate tab for lock and access_control only', () => {
    expect(deviceDetailTabsForKind('lock')).toContain('simulate');
    expect(deviceDetailTabsForKind('access_control')).toContain('simulate');
    expect(deviceDetailTabsForKind('bridge')).not.toContain('simulate');
    expect(deviceDetailTabsForKind('friend_node')).not.toContain('simulate');
  });

  it('always includes core tabs', () => {
    for (const kind of ['lock', 'access_control', 'bridge', 'friend_node'] as const) {
      const tabs = deviceDetailTabsForKind(kind);
      expect(tabs).toEqual(expect.arrayContaining(['overview', 'security', 'activity']));
      expect(tabs).not.toContain('telemetry');
      expect(tabs).not.toContain('keys');
    }
  });

  it('validates tab ids', () => {
    expect(isDeviceDetailTabId('overview')).toBe(true);
    expect(isDeviceDetailTabId('nope')).toBe(false);
  });

  it('maps legacy tab ids to merged tabs', () => {
    expect(normalizeDeviceDetailTab('keys')).toBe('security');
    expect(normalizeDeviceDetailTab('telemetry')).toBe('overview');
    expect(normalizeDeviceDetailTab('security')).toBe('security');
    expect(normalizeDeviceDetailTab('unknown')).toBeNull();
    expect(normalizeDeviceDetailTab(null)).toBeNull();
  });

  it('read/write tab via injectable storage', () => {
    let stored: string | null = null;
    const storage = {
      read: () => stored,
      write: (tab: string) => {
        stored = tab;
      },
    };
    expect(readDeviceDetailTab(storage)).toBe('overview');
    writeDeviceDetailTab('security', storage);
    expect(readDeviceDetailTab(storage)).toBe('security');
    stored = 'keys';
    expect(readDeviceDetailTab(storage)).toBe('security');
  });
});
