import { describe, expect, it } from 'vitest';
import type { GatewayEventEntry } from '../src/protocol/ipc-channels';
import {
  applyStatusBarEvent,
  applyUnprocessedStatusBarEvents,
  buildStatusBarTooltip,
  createInitialGatewayStatusBarState,
  hasActiveStatusOperations,
  humanizeCommandType,
  isStatusBarExcludedEvent,
  proxyPathLabel,
  reduceStatusBarEvents,
  resolveStatusBarDisplay,
  STATUS_BAR_FAILURE_MS,
  STATUS_BAR_SUCCESS_MS,
} from '../src/renderer/utils/gateway-status-bar.utils';

function entry(overrides: Partial<GatewayEventEntry> & Pick<GatewayEventEntry, 'direction'>): GatewayEventEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: '2026-06-27T12:00:00.000Z',
    summary: 'event',
    ...overrides,
  };
}

function reduceAll(events: GatewayEventEntry[]) {
  return reduceStatusBarEvents(createInitialGatewayStatusBarState(), events).state;
}

describe('gateway status bar exclusions', () => {
  it('excludes heartbeat traffic', () => {
    expect(isStatusBarExcludedEvent(entry({ direction: 'in', summary: 'PING' }))).toBe(true);
    expect(isStatusBarExcludedEvent(entry({ direction: 'out', summary: 'PONG' }))).toBe(true);
    expect(isStatusBarExcludedEvent(entry({ direction: 'in', summary: 'PONG_OK' }))).toBe(true);
  });

  it('allows proxy and sync activity', () => {
    expect(
      isStatusBarExcludedEvent(
        entry({
          direction: 'out',
          summary: 'PROXY_REQUEST',
          payload: { type: 'PROXY_REQUEST', id: '1', path: '/internal/gateway/devices/state', method: 'POST' },
        }),
      ),
    ).toBe(false);
  });
});

describe('proxyPathLabel', () => {
  it('maps known internal paths to friendly labels', () => {
    expect(proxyPathLabel('/internal/gateway/devices/inventory')).toBe('inventory sync');
    expect(proxyPathLabel('/internal/gateway/devices/state')).toBe('state sync');
    expect(proxyPathLabel('/internal/gateway/access-events')).toBe('access event');
    expect(proxyPathLabel('/internal/gateway/add_log')).toBe('telemetry log');
  });
});

describe('humanizeCommandType', () => {
  it('formats command constants for display', () => {
    expect(humanizeCommandType('FIRMWARE_UPDATE_STATUS')).toBe('Firmware Update Status');
  });
});

describe('proxy request lifecycle', () => {
  it('shows sending then success for inventory sync', () => {
    const requestId = 'req-inventory';
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'PROXY_REQUEST',
        payload: {
          type: 'PROXY_REQUEST',
          id: requestId,
          method: 'POST',
          path: '/internal/gateway/devices/inventory',
        },
      }),
      entry({
        direction: 'in',
        summary: 'PROXY_RESPONSE 200',
        payload: { type: 'PROXY_RESPONSE', id: requestId, status: 200, body: { ok: true } },
      }),
    ]);

    expect(state.current?.message).toBe('Sent inventory sync OK');
    expect(state.current?.phase).toBe('success');
    expect(Object.keys(state.pendingProxies)).toHaveLength(0);
  });

  it('shows failure when proxy response is non-2xx', () => {
    const requestId = 'req-state';
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'PROXY_REQUEST',
        payload: {
          type: 'PROXY_REQUEST',
          id: requestId,
          method: 'POST',
          path: '/internal/gateway/devices/state',
        },
      }),
      entry({
        direction: 'in',
        summary: 'PROXY_RESPONSE 500',
        payload: { type: 'PROXY_RESPONSE', id: requestId, status: 500, body: { message: 'fail' } },
      }),
    ]);

    expect(state.current?.message).toBe('Sent state sync failed');
    expect(state.current?.phase).toBe('failed');
    expect(state.current?.tooltipLines.join('\n')).toContain('HTTP 500');
  });

  it('tracks live state sync via system log', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'Live state sync HTTP 200 (lock:abc)',
      }),
    ]);

    expect(state.current?.message).toBe('Sent live state sync OK');
    expect(state.current?.tooltipLines.join('\n')).toContain('lock:abc');
  });

  it('reports live state sync failures from system logs', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'Live state sync failed: proxy unavailable',
      }),
    ]);

    expect(state.current?.message).toBe('Sent live state sync failed');
    expect(state.current?.phase).toBe('failed');
  });
});

describe('firmware push lifecycle', () => {
  it('tracks manifest, chunk acks, and terminal status updates', () => {
    const state = reduceAll([
      entry({
        direction: 'in',
        summary: 'FIRMWARE_MANIFEST',
        payload: { type: 'FIRMWARE_MANIFEST', chunk_count: 2 },
      }),
      entry({
        direction: 'out',
        summary: 'FIRMWARE_CHUNK_ACK',
        payload: { type: 'FIRMWARE_CHUNK_ACK', status: 'ok', chunkIndex: 0 },
      }),
      entry({
        direction: 'out',
        summary: 'FIRMWARE_UPDATE_STATUS',
        payload: {
          type: 'FIRMWARE_UPDATE_STATUS',
          push_id: 'push-1',
          status: 'verifying',
          version: '2.0.0',
          target_type: 'gateway',
        },
      }),
      entry({
        direction: 'out',
        summary: 'FIRMWARE_UPDATE_STATUS',
        payload: {
          type: 'FIRMWARE_UPDATE_STATUS',
          push_id: 'push-1',
          status: 'applying',
          version: '2.0.0',
        },
      }),
      entry({
        direction: 'out',
        summary: 'FIRMWARE_UPDATE_STATUS',
        payload: {
          type: 'FIRMWARE_UPDATE_STATUS',
          push_id: 'push-1',
          status: 'success',
          version: '2.0.0',
        },
      }),
    ]);

    expect(state.current?.message).toBe('Sent firmware update OK');
    expect(state.history[0]?.message).toBe('Sent firmware update OK');
    expect(state.firmwarePush).toBeNull();
  });

  it('reports firmware failure status', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'FIRMWARE_UPDATE_STATUS',
        payload: {
          type: 'FIRMWARE_UPDATE_STATUS',
          push_id: 'push-1',
          status: 'failed',
          error: 'verification failed',
        },
      }),
    ]);

    expect(state.current?.message).toBe('Sent firmware update failed');
    expect(state.current?.tooltipLines.join('\n')).toContain('verification failed');
  });

  it('shows in-progress firmware status for intermediate phases', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'FIRMWARE_UPDATE_STATUS',
        payload: { type: 'FIRMWARE_UPDATE_STATUS', status: 'downloading', push_id: 'p1' },
      }),
    ]);
    expect(state.current?.message).toBe('Firmware push in progress (downloading)');
  });

  it('counts successful firmware chunk acks', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'FIRMWARE_CHUNK_ACK ok',
        payload: { type: 'FIRMWARE_CHUNK_ACK', status: 'ok', chunkIndex: 0 },
      }),
    ]);
    expect(state.firmwarePush?.chunksReceived).toBe(1);
    expect(state.current?.phase).toBe('in-progress');
  });
});

describe('inventory snapshot lifecycle', () => {
  it('tracks chunk acks and success status', () => {
    const state = reduceAll([
      entry({
        direction: 'in',
        summary: 'INVENTORY_SNAPSHOT_MANIFEST',
        payload: { type: 'INVENTORY_SNAPSHOT_MANIFEST', chunk_count: 1 },
      }),
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_CHUNK_ACK',
        payload: { type: 'INVENTORY_SNAPSHOT_CHUNK_ACK', status: 'ok', chunkIndex: 0 },
      }),
      entry({
        direction: 'system',
        summary: 'Inventory snapshot applied — 3 device(s) loaded from cloud push',
        payload: { snapshotId: 'snap-1', deviceCount: 3 },
      }),
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_STATUS',
        payload: {
          type: 'INVENTORY_SNAPSHOT_STATUS',
          snapshot_id: 'snap-1',
          status: 'success',
        },
      }),
    ]);

    expect(state.current?.message).toBe('Sent inventory snapshot OK');
    expect(state.inventorySnapshot).toBeNull();
  });

  it('shows in-progress inventory snapshot status', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_STATUS applying',
        payload: { type: 'INVENTORY_SNAPSHOT_STATUS', status: 'applying', snapshot_id: 'snap-1' },
      }),
    ]);
    expect(state.current?.message).toBe('Inventory snapshot in progress (applying)');
  });

  it('counts successful inventory snapshot chunk acks', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_CHUNK_ACK ok',
        payload: { type: 'INVENTORY_SNAPSHOT_CHUNK_ACK', status: 'ok', chunkIndex: 0 },
      }),
    ]);
    expect(state.inventorySnapshot?.chunksReceived).toBe(1);
  });
});

describe('command handling', () => {
  it('shows processing then success for lock command responses', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'Inbound LOCK for device_id=lock-1',
      }),
      entry({
        direction: 'system',
        summary: 'Applied LOCK → state sync HTTP 200',
      }),
    ]);

    expect(state.current?.message).toBe('Sent command response OK');
    expect(state.activeCommand).toBeNull();
  });

  it('shows failure when post-command state sync fails', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'State sync failed after LOCK: HTTP 503',
      }),
    ]);

    expect(state.current?.message).toBe('Sent command response failed');
  });
});

describe('reduceStatusBarEvents incremental processing', () => {
  it('processes only new events when called with a cursor', () => {
    const events = [
      entry({
        direction: 'out',
        summary: 'AUTH sent',
        payload: { facilityId: 'fac-1', gatewayId: 'gw-1' },
      }),
    ];

    const first = reduceStatusBarEvents(createInitialGatewayStatusBarState(), events, 0);
    expect(first.state.current?.message).toBe('Sending authentication');
    expect(first.nextIndex).toBe(1);

    const second = reduceStatusBarEvents(first.state, events, first.nextIndex);
    expect(second.state.current?.message).toBe('Sending authentication');
    expect(second.nextIndex).toBe(1);
  });
});

describe('resolveStatusBarDisplay', () => {
  it('shows pending proxy activity even if current was overwritten', () => {
    const requestId = 'req-state';
    const state = applyStatusBarEvent(createInitialGatewayStatusBarState(), {
      id: '1',
      timestamp: '2026-06-27T12:00:00.000Z',
      direction: 'out',
      summary: 'PROXY_REQUEST',
      payload: {
        type: 'PROXY_REQUEST',
        id: requestId,
        method: 'POST',
        path: '/internal/gateway/devices/state',
      },
    });

    const withStaleCurrent = {
      ...state,
      current: {
        phase: 'success' as const,
        message: 'Sent inventory sync OK',
        timestamp: '2026-06-27T12:00:00.000Z',
        tooltipLines: [],
      },
    };

    expect(resolveStatusBarDisplay(withStaleCurrent)?.message).toBe('Sending state sync');
  });

  it('expires completed success messages after the ttl', () => {
    const reduced = reduceAll([
      entry({
        direction: 'system',
        summary: 'State sync HTTP 200',
      }),
    ]);
    const state = { ...reduced, lastActivityAt: Date.parse('2026-06-27T12:00:00.000Z') };

    const fresh = resolveStatusBarDisplay(state, Date.parse('2026-06-27T12:00:00.000Z'));
    expect(fresh?.message).toBe('Sent state sync OK');

    const expired = resolveStatusBarDisplay(
      state,
      Date.parse('2026-06-27T12:00:00.000Z') + STATUS_BAR_SUCCESS_MS + 1,
    );
    expect(expired).toBeNull();
  });

  it('keeps failures visible longer than success', () => {
    const reduced = reduceAll([
      entry({
        direction: 'system',
        summary: 'State sync HTTP 500',
      }),
    ]);
    const state = { ...reduced, lastActivityAt: Date.parse('2026-06-27T12:00:00.000Z') };

    const stillVisible = resolveStatusBarDisplay(
      state,
      Date.parse('2026-06-27T12:00:00.000Z') + STATUS_BAR_SUCCESS_MS + 100,
    );
    expect(stillVisible?.phase).toBe('failed');

    const expired = resolveStatusBarDisplay(
      state,
      Date.parse('2026-06-27T12:00:00.000Z') + STATUS_BAR_FAILURE_MS + 1,
    );
    expect(expired).toBeNull();
  });
});

describe('applyUnprocessedStatusBarEvents', () => {
  it('tracks processed ids across event array replacements', () => {
    const first = entry({
      direction: 'out',
      summary: 'PROXY_REQUEST',
      payload: {
        type: 'PROXY_REQUEST',
        id: 'req-1',
        method: 'POST',
        path: '/internal/gateway/devices/state',
      },
    });
    const second = entry({
      direction: 'in',
      summary: 'PROXY_RESPONSE 200',
      payload: { type: 'PROXY_RESPONSE', id: 'req-1', status: 200 },
    });

    const initial = createInitialGatewayStatusBarState();
    const processed = new Set<string>();
    const afterFirst = applyUnprocessedStatusBarEvents(initial, [first], processed);
    expect(afterFirst.state.current?.message).toBe('Sending state sync');

    const replacedBatch = applyUnprocessedStatusBarEvents(afterFirst.state, [first, second], afterFirst.processedIds);
    expect(replacedBatch.state.current?.message).toBe('Sent state sync OK');
  });
});

describe('buildStatusBarTooltip', () => {
  it('includes recent history after the primary operation details', () => {
    const state = reduceAll([
      entry({ direction: 'out', summary: 'AUTH sent' }),
      entry({
        direction: 'system',
        summary: 'Inventory sync HTTP 200',
      }),
    ]);

    const lines = buildStatusBarTooltip(state, state.current);
    expect(lines[0]).toContain('HTTP 200');
    expect(lines.join('\n')).toContain('Recent activity:');
    expect(lines.join('\n')).toContain('Sending authentication');
  });
});

describe('applyStatusBarEvent direct cases', () => {
  it('ignores heartbeat events without mutating state', () => {
    const initial = createInitialGatewayStatusBarState();
    const next = applyStatusBarEvent(initial, entry({ direction: 'in', summary: 'PING' }));
    expect(next).toEqual(initial);
  });

  it('shows deferred inventory sync as a failure state', () => {
    const state = applyStatusBarEvent(createInitialGatewayStatusBarState(), {
      id: '1',
      timestamp: '2026-06-27T12:00:00.000Z',
      direction: 'system',
      summary: 'Inventory sync deferred: recovery in progress',
    });

    expect(state.current?.message).toBe('Inventory sync deferred');
    expect(state.current?.phase).toBe('failed');
  });
});

describe('ACK and outbound push edge cases', () => {
  it('reports firmware chunk ACK failures', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'FIRMWARE_CHUNK_ACK error',
        payload: { type: 'FIRMWARE_CHUNK_ACK', status: 'error', message: 'hash mismatch' },
      }),
    ]);
    expect(state.current?.message).toBe('Sent firmware chunk ACK failed');
    expect(state.current?.phase).toBe('failed');
  });

  it('reports inventory snapshot chunk ACK failures', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_CHUNK_ACK error',
        payload: { type: 'INVENTORY_SNAPSHOT_CHUNK_ACK', status: 'error', message: 'bad chunk' },
      }),
    ]);
    expect(state.current?.message).toBe('Sent inventory snapshot chunk ACK failed');
  });

  it('shows success for COMMAND_ACK and access/device deleted ACKs', () => {
    const commandAck = reduceAll([
      entry({
        direction: 'out',
        summary: 'COMMAND_ACK',
        payload: { type: 'COMMAND_ACK', status: 'ok' },
      }),
    ]);
    expect(commandAck.current?.message).toBe('Sent command ACK OK');

    const accessAck = reduceAll([
      entry({
        direction: 'out',
        summary: 'ACCESS_CODE_UPDATE_ACK',
        payload: { type: 'ACCESS_CODE_UPDATE_ACK' },
      }),
    ]);
    expect(accessAck.current?.message).toBe('Sent access code update ACK OK');

    const deletedAck = reduceAll([
      entry({
        direction: 'out',
        summary: 'DEVICE_DELETED_ACK',
        payload: { type: 'DEVICE_DELETED_ACK' },
      }),
    ]);
    expect(deletedAck.current?.message).toBe('Sent device deleted ACK OK');
  });

  it('reports inventory snapshot push failure status', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'INVENTORY_SNAPSHOT_STATUS failed',
        payload: { type: 'INVENTORY_SNAPSHOT_STATUS', status: 'failed', error: 'apply error' },
      }),
    ]);
    expect(state.current?.message).toBe('Sent inventory snapshot failed');
    expect(state.current?.tooltipLines.join('\n')).toContain('apply error');
  });

  it('shows generic outbound message types as sending', () => {
    const state = reduceAll([
      entry({
        direction: 'out',
        summary: 'AUTH',
        payload: { type: 'AUTH', facilityId: 'f1' },
      }),
    ]);
    expect(state.current?.message).toBe('Sending Auth');
  });
});

describe('inbound push and command events', () => {
  function jwtPayload(cmdType: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ cmd_type: cmdType })).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  it('tracks inbound firmware manifest and chunk via JWT command', () => {
    const manifest = reduceAll([
      entry({
        direction: 'in',
        summary: 'COMMAND',
        payload: { type: 'COMMAND', jwt: jwtPayload('FIRMWARE_MANIFEST') },
      }),
    ]);
    expect(manifest.current?.message).toContain('receiving manifest');
    expect(manifest.firmwarePush).not.toBeNull();

    const chunk = applyStatusBarEvent(manifest, {
      ...entry({
        direction: 'in',
        summary: 'COMMAND',
        payload: { type: 'COMMAND', jwt: jwtPayload('FIRMWARE_CHUNK') },
      }),
    });
    expect(chunk.current?.message).toContain('receiving chunks');
  });

  it('tracks inbound inventory snapshot manifest and chunk types', () => {
    const manifest = reduceAll([
      entry({
        direction: 'in',
        summary: 'INVENTORY_SNAPSHOT_MANIFEST',
        payload: { type: 'INVENTORY_SNAPSHOT_MANIFEST', chunk_count: 2 },
      }),
    ]);
    expect(manifest.inventorySnapshot?.chunkCount).toBe(2);

    const chunk = applyStatusBarEvent(manifest, {
      ...entry({
        direction: 'in',
        summary: 'INVENTORY_SNAPSHOT_CHUNK',
        payload: { type: 'INVENTORY_SNAPSHOT_CHUNK' },
      }),
    });
    expect(chunk.current?.message).toContain('receiving chunks');
  });

  it('tracks inbound inventory snapshot via JWT command types', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const manifestPayload = Buffer.from(JSON.stringify({ cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST' })).toString('base64url');
    const chunkPayload = Buffer.from(JSON.stringify({ cmd_type: 'INVENTORY_SNAPSHOT_CHUNK' })).toString('base64url');

    const manifest = reduceAll([
      entry({
        direction: 'in',
        summary: 'COMMAND',
        payload: { type: 'COMMAND', jwt: `${header}.${manifestPayload}.sig` },
      }),
    ]);
    expect(manifest.current?.message).toContain('receiving manifest');

    const chunk = applyStatusBarEvent(manifest, {
      ...entry({
        direction: 'in',
        summary: 'COMMAND',
        payload: { type: 'COMMAND', jwt: `${header}.${chunkPayload}.sig` },
      }),
    });
    expect(chunk.current?.message).toContain('receiving chunks');
  });

  it('sets activeCommand for inbound lock commands', () => {
    const state = reduceAll([
      entry({
        direction: 'in',
        summary: 'COMMAND LOCK',
        payload: { commandType: 'LOCK' },
      }),
    ]);
    expect(state.activeCommand?.label).toBe('Lock');
    expect(state.current?.message).toBe('Processing Lock');
  });

  it('completes inbound proxy responses', () => {
    const requestId = 'proxy-in';
    const pending = applyStatusBarEvent(createInitialGatewayStatusBarState(), {
      ...entry({
        direction: 'out',
        summary: 'PROXY_REQUEST',
        payload: {
          type: 'PROXY_REQUEST',
          id: requestId,
          method: 'POST',
          path: '/internal/gateway/access-events',
        },
      }),
    });
    const done = applyStatusBarEvent(pending, {
      ...entry({
        direction: 'in',
        summary: 'PROXY_RESPONSE 201',
        payload: { type: 'PROXY_RESPONSE', id: requestId, status: 201, body: { ok: true } },
      }),
    });
    expect(done.current?.message).toBe('Sent access event OK');
  });
});

describe('resolveStatusBarDisplay active operations', () => {
  it('prefers firmware and snapshot in-progress displays', () => {
    const base = createInitialGatewayStatusBarState();
    const firmware = {
      ...base,
      firmwarePush: {
        kind: 'firmware-push' as const,
        phase: 'verifying',
        startedAt: '2026-06-27T12:00:00.000Z',
      },
      current: null,
    };
    expect(resolveStatusBarDisplay(firmware)?.message).toContain('Firmware push');

    const snapshot = {
      ...base,
      inventorySnapshot: {
        kind: 'inventory-snapshot' as const,
        phase: 'applying',
        startedAt: '2026-06-27T12:00:00.000Z',
      },
      current: null,
    };
    expect(resolveStatusBarDisplay(snapshot)?.message).toContain('Inventory snapshot');
  });

  it('shows active command when current is cleared', () => {
    const state = {
      ...createInitialGatewayStatusBarState(),
      activeCommand: { label: 'Unlock', startedAt: '2026-06-27T12:00:00.000Z' },
      current: null,
    };
    expect(resolveStatusBarDisplay(state)?.message).toBe('Processing Unlock');
  });

  it('keeps in-progress current visible without ttl expiry', () => {
    const state = {
      ...createInitialGatewayStatusBarState(),
      current: {
        phase: 'in-progress' as const,
        message: 'Working',
        timestamp: '2026-06-27T12:00:00.000Z',
        tooltipLines: [],
      },
    };
    expect(resolveStatusBarDisplay(state, Date.parse('2099-01-01T00:00:00.000Z'))?.message).toBe('Working');
  });
});

describe('hasActiveStatusOperations', () => {
  it('detects pending proxies, pushes, and commands', () => {
    expect(hasActiveStatusOperations(createInitialGatewayStatusBarState())).toBe(false);
    const busy = {
      ...createInitialGatewayStatusBarState(),
      pendingProxies: {
        r1: {
          id: 'r1',
          label: 'state sync',
          path: '/state',
          method: 'POST',
          startedAt: '2026-06-27T12:00:00.000Z',
        },
      },
    };
    expect(hasActiveStatusOperations(busy)).toBe(true);
  });
});

describe('system and unknown event branches', () => {
  it('handles inventory snapshot applied system log', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'Inventory snapshot applied — 2 device(s) loaded from cloud push',
        payload: { deviceCount: 2 },
      }),
    ]);
    expect(state.current?.message).toBe('Sent inventory snapshot OK');
  });

  it('handles inbound system command prefix', () => {
    const state = reduceAll([
      entry({
        direction: 'system',
        summary: 'Inbound UNLOCK for device_id=lock-9',
      }),
    ]);
    expect(state.activeCommand?.label).toBe('UNLOCK');
  });

  it('ignores unrecognized inbound payloads', () => {
    const initial = createInitialGatewayStatusBarState();
    const next = applyStatusBarEvent(initial, {
      ...entry({ direction: 'in', summary: 'UNKNOWN' }),
      payload: { type: 'PONG' },
    });
    expect(next).toEqual(initial);
  });

  it('ignores unknown event directions', () => {
    const initial = createInitialGatewayStatusBarState();
    const next = applyStatusBarEvent(initial, {
      ...entry({ direction: 'system' }),
      direction: 'unknown' as GatewayEventEntry['direction'],
    });
    expect(next).toEqual(initial);
  });
});
