import type WebSocket from 'ws';
import {
  CONNECTION_HEALTH_SWEEP_MS,
  INBOUND_IDLE_TIMEOUT_MS,
  JSON_PONG_OK_TIMEOUT_MS,
  MAX_MISSED_JSON_HEARTBEATS,
  MAX_MISSED_WS_PROBES,
  WS_PROBE_INTERVAL_MS,
  WS_PROBE_TIMEOUT_MS,
} from './connection-health.constants';

export type ConnectionHealthCallbacks = {
  onUnhealthy: (reason: string) => void;
  onLog?: (summary: string) => void;
  wsPing: () => void;
};

/**
 * Active + passive liveness for gateway WebSocket sessions.
 * - Client WS ping/pong frames (proves TCP/WS path to backend)
 * - JSON PING → PONG → PONG_OK chain (proves app layer processed our PONG)
 * - Inbound idle fallback
 */
export class ConnectionHealthMonitor {
  private ws: WebSocket | null = null;
  private wsProbeTimer: ReturnType<typeof setInterval> | null = null;
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private wsProbeTimeout: ReturnType<typeof setTimeout> | null = null;
  private jsonPongOkTimeout: ReturnType<typeof setTimeout> | null = null;

  private lastInboundAt = 0;
  private pendingWsProbe = false;
  private missedWsProbes = 0;
  private pendingJsonPong = false;
  private missedJsonHeartbeats = 0;
  private stopped = false;

  constructor(private readonly callbacks: ConnectionHealthCallbacks) {}

  start(ws: WebSocket): void {
    this.stop();
    this.stopped = false;
    this.ws = ws;
    this.lastInboundAt = Date.now();
    this.missedWsProbes = 0;
    this.missedJsonHeartbeats = 0;
    this.pendingWsProbe = false;
    this.pendingJsonPong = false;

    this.wsProbeTimer = setInterval(() => this.runWsProbe(), WS_PROBE_INTERVAL_MS);
    this.wsProbeTimer.unref?.();

    this.idleSweepTimer = setInterval(() => this.runIdleSweep(), CONNECTION_HEALTH_SWEEP_MS);
    this.idleSweepTimer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.wsProbeTimer) clearInterval(this.wsProbeTimer);
    if (this.idleSweepTimer) clearInterval(this.idleSweepTimer);
    if (this.wsProbeTimeout) clearTimeout(this.wsProbeTimeout);
    if (this.jsonPongOkTimeout) clearTimeout(this.jsonPongOkTimeout);
    this.wsProbeTimer = null;
    this.idleSweepTimer = null;
    this.wsProbeTimeout = null;
    this.jsonPongOkTimeout = null;
    this.ws = null;
    this.pendingWsProbe = false;
    this.pendingJsonPong = false;
  }

  noteInboundMessageType(type: string | undefined): void {
    this.lastInboundAt = Date.now();
    if (type === 'PING') {
      this.missedJsonHeartbeats = 0;
    }
    if (type === 'PONG_OK') {
      this.clearJsonPongPending();
      this.missedJsonHeartbeats = 0;
    }
  }

  noteServerWsPing(): void {
    this.lastInboundAt = Date.now();
  }

  noteWsPong(): void {
    this.lastInboundAt = Date.now();
    this.pendingWsProbe = false;
    this.missedWsProbes = 0;
    if (this.wsProbeTimeout) {
      clearTimeout(this.wsProbeTimeout);
      this.wsProbeTimeout = null;
    }
  }

  noteJsonPongSent(): void {
    this.clearJsonPongPending();
    this.pendingJsonPong = true;
    this.jsonPongOkTimeout = setTimeout(() => {
      this.pendingJsonPong = false;
      this.recordJsonHeartbeatMiss('json_pong_ok_timeout');
    }, JSON_PONG_OK_TIMEOUT_MS);
    this.jsonPongOkTimeout.unref?.();
  }

  private clearJsonPongPending(): void {
    this.pendingJsonPong = false;
    if (this.jsonPongOkTimeout) {
      clearTimeout(this.jsonPongOkTimeout);
      this.jsonPongOkTimeout = null;
    }
  }

  private runWsProbe(): void {
    if (this.stopped || !this.ws || this.ws.readyState !== 1) return;

    if (this.pendingWsProbe) {
      this.recordWsProbeMiss('ws_probe_timeout');
      return;
    }

    this.pendingWsProbe = true;
    try {
      this.callbacks.wsPing();
    } catch {
      this.recordWsProbeMiss('ws_probe_send_failed');
      return;
    }

    this.wsProbeTimeout = setTimeout(() => {
      if (this.pendingWsProbe) {
        this.recordWsProbeMiss('ws_probe_timeout');
      }
    }, WS_PROBE_TIMEOUT_MS);
    this.wsProbeTimeout.unref?.();
  }

  private runIdleSweep(): void {
    if (this.stopped || !this.ws || this.ws.readyState !== 1) return;
    if (Date.now() - this.lastInboundAt > INBOUND_IDLE_TIMEOUT_MS) {
      this.fail('inbound_idle_timeout');
    }
  }

  private recordWsProbeMiss(reason: string): void {
    this.pendingWsProbe = false;
    if (this.wsProbeTimeout) {
      clearTimeout(this.wsProbeTimeout);
      this.wsProbeTimeout = null;
    }
    this.missedWsProbes += 1;
    this.callbacks.onLog?.(`WS liveness probe failed (${this.missedWsProbes}/${MAX_MISSED_WS_PROBES}): ${reason}`);
    if (this.missedWsProbes >= MAX_MISSED_WS_PROBES) {
      this.fail(reason);
    }
  }

  private recordJsonHeartbeatMiss(reason: string): void {
    this.missedJsonHeartbeats += 1;
    this.callbacks.onLog?.(`JSON heartbeat failed (${this.missedJsonHeartbeats}/${MAX_MISSED_JSON_HEARTBEATS}): ${reason}`);
    if (this.missedJsonHeartbeats >= MAX_MISSED_JSON_HEARTBEATS) {
      this.fail(reason);
    }
  }

  private fail(reason: string): void {
    if (this.stopped) return;
    this.stop();
    this.callbacks.onUnhealthy(reason);
  }
}
