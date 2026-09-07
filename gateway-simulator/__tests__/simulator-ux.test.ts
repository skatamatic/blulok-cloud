import { describe, expect, it, vi } from 'vitest';
import { ADDABLE_INVENTORY_KINDS, GATEWAY_INVENTORY_KINDS } from '../src/protocol/device-kinds';
import { DEFAULT_BEHAVIOR, normalizeBehavior } from '../src/protocol/ipc-channels';
import type { GatewayEventEntry } from '../src/protocol/ipc-channels';
import { ACCESS_EVENT_PRESETS, ACCESS_EVENT_ACTIONS } from '../src/protocol/access-events';
import { isHeartbeatEvent, formatEventLogLocalTime } from '../src/renderer/utils/event-log.utils';
import { GATEWAY_PANEL_TABS, readGatewayPanelTab } from '../src/renderer/utils/gateway-panel.utils';
import { USER_PANEL_TABS, readUserPanelTab } from '../src/renderer/utils/user-panel.utils';
import { resolveTabSlideDirection } from '../src/renderer/components/PanelTabTransition';
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../src/renderer/utils/gateway-sidebar-layout.utils';

function entry(overrides: Partial<GatewayEventEntry>): GatewayEventEntry {
  return {
    id: '1',
    timestamp: '2026-01-01T00:00:00.000Z',
    direction: 'in',
    summary: 'PING',
    ...overrides,
  };
}

import type { DeviceInventoryItem } from '@protocol/device-kinds';
import {
  DEFAULT_DEVICE_LIST_FILTERS,
  filterAndSortDevices,
  getDeviceSearchableText,
  getDeviceSortValue,
} from '../src/renderer/utils/device-inventory-list.utils';

describe('device inventory list filter/sort', () => {
  const lockA: DeviceInventoryItem = {
    kind: 'lock',
    lock_id: 'LOCK-100',
    state: 'CLOSED',
    locked: true,
    online: true,
    firmware_version: '2.0.0',
    battery_level: 3400,
    signal_strength: -55,
  };
  const lockB: DeviceInventoryItem = {
    kind: 'lock',
    lock_id: 'LOCK-200',
    state: 'OPENED',
    locked: false,
    online: false,
    firmware_version: '1.0.0',
    battery_level: 3100,
    signal_strength: -70,
  };
  const bridge: DeviceInventoryItem = {
    kind: 'bridge',
    serial: 'BR-001',
    online: true,
    firmware_version: '3.1.0',
    state: 'healthy',
  };

  it('filters by search text across id, kind, and firmware', () => {
    expect(getDeviceSearchableText(lockA)).toContain('lock-100');
    const result = filterAndSortDevices([lockA, lockB, bridge], {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      search: '2.0.0',
    });
    expect(result).toEqual([lockA]);
  });

  it('filters by kind and online status', () => {
    const result = filterAndSortDevices([lockA, lockB, bridge], {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      kind: 'lock',
      online: 'offline',
    });
    expect(result).toEqual([lockB]);
  });

  it('sorts by numeric battery descending', () => {
    const result = filterAndSortDevices([lockA, lockB], {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      sortColumn: 'battery',
      sortDirection: 'desc',
    });
    expect(result.map((d) => (d.kind === 'lock' ? d.lock_id : ''))).toEqual(['LOCK-100', 'LOCK-200']);
  });

  it('sorts by kind then id as tiebreaker', () => {
    const result = filterAndSortDevices([bridge, lockB, lockA], {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      sortColumn: 'kind',
      sortDirection: 'asc',
    });
    expect(result[0].kind).toBe('bridge');
    expect(getDeviceSortValue(lockA, 'id')).toBe('LOCK-100');
  });
});

describe('gateway panel tabs', () => {
  it('defines five functional categories with devices as default', () => {
    expect(GATEWAY_PANEL_TABS.map((t) => t.id)).toEqual([
      'devices',
      'connection',
      'behavior',
      'settings',
      'logs',
    ]);
    expect(readGatewayPanelTab()).toBe('devices');
  });

  it('migrates legacy access tab selection to devices', () => {
    const store: Record<string, string> = { 'simulator.gatewayPanelTab': 'access' };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    expect(readGatewayPanelTab()).toBe('devices');
    vi.unstubAllGlobals();
  });

  it('resolves tab slide direction from tab order', () => {
    expect(resolveTabSlideDirection('devices', 'connection')).toBe('right');
    expect(resolveTabSlideDirection('logs', 'devices')).toBe('left');
    expect(resolveTabSlideDirection('behavior', 'behavior')).toBe('right');
  });
});

describe('user panel tabs', () => {
  it('defines session, devices, and app with session as default', () => {
    expect(USER_PANEL_TABS.map((t) => t.id)).toEqual(['session', 'devices', 'app']);
    expect(readUserPanelTab()).toBe('session');
  });
});

describe('event log heartbeat filter', () => {
  it('detects PING, PONG, and PONG_OK by summary or payload type', () => {
    expect(isHeartbeatEvent(entry({ summary: 'PING' }))).toBe(true);
    expect(isHeartbeatEvent(entry({ summary: 'PONG', direction: 'out' }))).toBe(true);
    expect(isHeartbeatEvent(entry({ summary: 'PONG_OK' }))).toBe(true);
    expect(isHeartbeatEvent(entry({ summary: 'PROXY_RESPONSE 200', payload: { type: 'PROXY_RESPONSE' } }))).toBe(
      false,
    );
    expect(isHeartbeatEvent(entry({ summary: 'unknown', payload: { type: 'PING' } }))).toBe(true);
  });

  it('formats event timestamps in local time', () => {
    const utc = '2026-06-26T18:30:45.123Z';
    const formatted = formatEventLogLocalTime(utc);
    const expected = new Date(utc).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    expect(formatted).toBe(expected);
  });
});

describe('device-kinds addable inventory', () => {
  it('excludes gateway from addable kinds', () => {
    expect(GATEWAY_INVENTORY_KINDS).toContain('gateway');
    expect(ADDABLE_INVENTORY_KINDS).not.toContain('gateway');
    expect(ADDABLE_INVENTORY_KINDS.length).toBe(GATEWAY_INVENTORY_KINDS.length - 1);
  });
});

describe('gateway sidebar layout', () => {
  it('clamps width within bounds', () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(999)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(200)).toBe(200);
  });
});

describe('behavior defaults', () => {
  it('includes liveStateSync defaulting to true', () => {
    expect(DEFAULT_BEHAVIOR.liveStateSync).toBe(true);
  });

  it('normalizeBehavior fills missing fields and keeps reconnect/ping/live-sync always on', () => {
    expect(normalizeBehavior({ autoReconnect: false }).commandLatencyMs).toBe(0);
    expect(normalizeBehavior({ autoReconnect: false }).autoReconnect).toBe(true);
    expect(normalizeBehavior({ respondToPing: false }).respondToPing).toBe(true);
    expect(normalizeBehavior({ liveStateSync: false }).liveStateSync).toBe(true);
    expect(normalizeBehavior({}).liveStateSync).toBe(true);
    expect(normalizeBehavior({ autoLockResponse: false }).lockUnlockMode).toBe('apply-only');
    expect(normalizeBehavior({ autoLockResponse: true }).lockUnlockMode).toBe('accept');
  });
});

describe('access event presets', () => {
  it('uses valid actions and includes granted and denied flows', () => {
    expect(ACCESS_EVENT_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of ACCESS_EVENT_PRESETS) {
      expect(ACCESS_EVENT_ACTIONS).toContain(preset.request.action);
      if (!preset.request.success) {
        expect(preset.request.denial_reason).toBeTruthy();
      }
    }
    expect(ACCESS_EVENT_PRESETS.some((p) => p.request.success)).toBe(true);
    expect(ACCESS_EVENT_PRESETS.some((p) => !p.request.success)).toBe(true);
  });
});
