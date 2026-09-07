import { describe, expect, it, vi } from 'vitest';
import {
  formatEventLogLocalTime,
  isHeartbeatEvent,
  readHideHeartbeatLogsPreference,
  writeHideHeartbeatLogsPreference,
} from '../src/renderer/utils/event-log.utils';
import {
  readSidebarCollapsed,
  readSidebarWidth,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from '../src/renderer/utils/gateway-sidebar-layout.utils';
import { isGatewayPanelTabId, writeGatewayPanelTab } from '../src/renderer/utils/gateway-panel.utils';

describe('renderer localStorage utils', () => {
  it('read/write hide heartbeat preference', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    expect(readHideHeartbeatLogsPreference()).toBe(true);
    writeHideHeartbeatLogsPreference(false);
    expect(readHideHeartbeatLogsPreference()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('sidebar width read/write with clamping', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    writeSidebarWidth(999);
    expect(readSidebarWidth()).toBe(420);
    writeSidebarCollapsed(true);
    expect(readSidebarCollapsed()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('gateway panel tab helpers', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    writeGatewayPanelTab('settings');
    expect(isGatewayPanelTabId('settings')).toBe(true);
    expect(isGatewayPanelTabId('nope')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('formatEventLogLocalTime handles invalid timestamps', () => {
    expect(formatEventLogLocalTime('not-a-date')).toBe('not-a-date');
    const iso = '2026-06-26T18:30:45.123Z';
    expect(formatEventLogLocalTime(iso)).toBe(
      new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    );
  });

  it('isHeartbeatEvent detects payload type', () => {
    expect(
      isHeartbeatEvent({
        id: '1',
        timestamp: '',
        direction: 'in',
        summary: 'other',
        payload: { type: 'PONG_OK' },
      }),
    ).toBe(true);
  });
});
