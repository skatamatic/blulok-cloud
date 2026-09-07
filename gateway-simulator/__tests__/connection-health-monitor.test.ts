import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ConnectionHealthMonitor } from '../src/main/net/ConnectionHealthMonitor';
import {
  INBOUND_IDLE_TIMEOUT_MS,
  JSON_PONG_OK_TIMEOUT_MS,
  MAX_MISSED_JSON_HEARTBEATS,
  MAX_MISSED_WS_PROBES,
  WS_PROBE_INTERVAL_MS,
  WS_PROBE_TIMEOUT_MS,
  CONNECTION_HEALTH_SWEEP_MS,
} from '../src/main/net/connection-health.constants';

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  ping = vi.fn();
}

describe('ConnectionHealthMonitor', () => {
  it('calls onUnhealthy after repeated missed WS pongs', () => {
    vi.useFakeTimers();
    const ws = new FakeWebSocket();
    const onUnhealthy = vi.fn();
    const monitor = new ConnectionHealthMonitor({
      wsPing: () => ws.ping(),
      onUnhealthy,
    });

    monitor.start(ws as unknown as import('ws').default);
    vi.advanceTimersByTime(WS_PROBE_INTERVAL_MS);
    expect(ws.ping).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(WS_PROBE_TIMEOUT_MS);
    for (let i = 1; i < MAX_MISSED_WS_PROBES; i += 1) {
      vi.advanceTimersByTime(WS_PROBE_INTERVAL_MS);
      vi.advanceTimersByTime(WS_PROBE_TIMEOUT_MS);
    }

    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    monitor.stop();
    vi.useRealTimers();
  });

  it('resets missed WS probes when pong received', () => {
    vi.useFakeTimers();
    const ws = new FakeWebSocket();
    const onUnhealthy = vi.fn();
    const monitor = new ConnectionHealthMonitor({
      wsPing: () => ws.ping(),
      onUnhealthy,
    });

    monitor.start(ws as unknown as import('ws').default);
    vi.advanceTimersByTime(WS_PROBE_INTERVAL_MS);
    monitor.noteWsPong();
    vi.advanceTimersByTime(WS_PROBE_TIMEOUT_MS * MAX_MISSED_WS_PROBES);
    expect(onUnhealthy).not.toHaveBeenCalled();
    monitor.stop();
    vi.useRealTimers();
  });

  it('calls onUnhealthy after repeated JSON PONG_OK timeouts', () => {
    vi.useFakeTimers();
    const ws = new FakeWebSocket();
    const onUnhealthy = vi.fn();
    const monitor = new ConnectionHealthMonitor({
      wsPing: () => ws.ping(),
      onUnhealthy,
    });

    monitor.start(ws as unknown as import('ws').default);
    for (let i = 0; i < MAX_MISSED_JSON_HEARTBEATS; i += 1) {
      monitor.noteJsonPongSent();
      vi.advanceTimersByTime(JSON_PONG_OK_TIMEOUT_MS);
    }

    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    monitor.stop();
    vi.useRealTimers();
  });

  it('clears JSON heartbeat miss when PONG_OK arrives', () => {
    vi.useFakeTimers();
    const ws = new FakeWebSocket();
    const onUnhealthy = vi.fn();
    const monitor = new ConnectionHealthMonitor({
      wsPing: () => ws.ping(),
      onUnhealthy,
    });

    monitor.start(ws as unknown as import('ws').default);
    monitor.noteJsonPongSent();
    monitor.noteInboundMessageType('PONG_OK');
    vi.advanceTimersByTime(JSON_PONG_OK_TIMEOUT_MS * MAX_MISSED_JSON_HEARTBEATS);
    expect(onUnhealthy).not.toHaveBeenCalled();
    monitor.stop();
    vi.useRealTimers();
  });

  it('calls onUnhealthy on inbound idle timeout', () => {
    vi.useFakeTimers();
    const ws = new FakeWebSocket();
    const onUnhealthy = vi.fn();
    const monitor = new ConnectionHealthMonitor({
      wsPing: () => ws.ping(),
      onUnhealthy,
    });

    monitor.start(ws as unknown as import('ws').default);
    vi.advanceTimersByTime(INBOUND_IDLE_TIMEOUT_MS + CONNECTION_HEALTH_SWEEP_MS);
    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    monitor.stop();
    vi.useRealTimers();
  });
});
