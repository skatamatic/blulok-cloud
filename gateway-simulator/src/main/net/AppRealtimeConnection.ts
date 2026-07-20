import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { wsAppUrl } from '@protocol/constants';
import { summarizeAppRealtimeMessage } from './app-realtime-message.utils';

export type AppRealtimeLogDirection = 'in' | 'out' | 'system';

export type AppRealtimeConnectionOptions = {
  backendUrl: string;
  token: string;
  facilityId: string;
  onLog?: (direction: AppRealtimeLogDirection, summary: string, payload?: unknown, eventName?: string) => void;
  onClose?: (code: number, reason: string) => void;
};

const HEARTBEAT_INTERVAL_MS = 25_000;
const OPEN_TIMEOUT_MS = 10_000;
const SUBSCRIBE_TIMEOUT_MS = 15_000;

/**
 * Tenant app realtime client for `/ws/app`.
 * Opt-in only — no auto-reconnect (simulates opening/closing the phone app).
 */
export class AppRealtimeConnection {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionId: string | null = null;
  private closedIntentionally = false;

  constructor(private readonly options: AppRealtimeConnectionOptions) {}

  getSubscriptionId(): string | null {
    return this.subscriptionId;
  }

  async connect(): Promise<void> {
    this.closedIntentionally = false;
    const url = wsAppUrl(this.options.backendUrl, this.options.token);
    this.options.onLog?.('system', `Opening app realtime ${url.replace(/token=[^&]+/, 'token=***')}`);

    this.ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        try {
          socket.terminate();
        } catch {
          /* ignore */
        }
        reject(new Error('App WebSocket open timeout'));
      }, OPEN_TIMEOUT_MS);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.ws.on('message', (data) => this.handleRawMessage(data));
    this.ws.on('error', (err) => {
      this.options.onLog?.(
        'system',
        `WebSocket error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.ws.on('close', (code, reason) => {
      this.stopHeartbeat();
      const reasonText = reason?.toString?.() || '';
      this.options.onLog?.('system', `Disconnected (${code})${reasonText ? ` ${reasonText}` : ''}`);
      this.ws = null;
      this.options.onClose?.(code, reasonText);
    });

    await this.subscribe(this.options.facilityId);
    this.startHeartbeat();
  }

  disconnect(): void {
    this.closedIntentionally = true;
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      if (this.subscriptionId) {
        this.sendJson({
          type: 'unsubscription',
          subscriptionType: 'app',
          subscriptionId: this.subscriptionId,
        });
      }
    } catch {
      /* ignore */
    }
    try {
      ws.close(1000, 'app_closed');
    } catch {
      /* ignore */
    }
  }

  wasClosedIntentionally(): boolean {
    return this.closedIntentionally;
  }

  private async subscribe(facilityId: string): Promise<void> {
    const subscriptionId = `app-sim-${randomUUID()}`;
    this.subscriptionId = subscriptionId;

    const ackPromise = new Promise<void>((resolve, reject) => {
      let onMsg: (data: WebSocket.RawData) => void = () => undefined;
      const timer = setTimeout(() => {
        this.ws?.off('message', onMsg);
        reject(new Error('App subscribe timeout'));
      }, SUBSCRIBE_TIMEOUT_MS);
      onMsg = (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(String(data)) as {
            type?: string;
            subscriptionType?: string;
            subscriptionId?: string;
            code?: string;
            message?: string;
          };
          if (msg.type === 'error') {
            clearTimeout(timer);
            this.ws?.off('message', onMsg);
            reject(new Error(`${msg.code || 'error'}: ${msg.message || 'subscribe failed'}`));
            return;
          }
          if (
            msg.type === 'subscription' &&
            msg.subscriptionType === 'app' &&
            msg.subscriptionId === subscriptionId
          ) {
            clearTimeout(timer);
            this.ws?.off('message', onMsg);
            resolve();
          }
        } catch {
          /* ignore parse errors here; main handler logs them */
        }
      };
      this.ws?.on('message', onMsg);
    });

    this.sendJson({
      type: 'subscription',
      subscriptionType: 'app',
      subscriptionId,
      data: { facility_id: facilityId },
    });

    await ackPromise;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.sendJson({ type: 'heartbeat' });
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleRawMessage(data: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      this.options.onLog?.('in', 'Invalid JSON message', String(data));
      return;
    }
    const { summary, eventName } = summarizeAppRealtimeMessage(parsed);
    this.options.onLog?.('in', summary, parsed, eventName);
  }

  private sendJson(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('App WebSocket not open');
    }
    const { summary, eventName } = summarizeAppRealtimeMessage(message);
    this.options.onLog?.('out', summary, message, eventName);
    this.ws.send(JSON.stringify(message));
  }
}
