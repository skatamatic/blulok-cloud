import { randomUUID } from 'crypto';
import type { ProxyResponseMessage } from '@protocol/messages';
import { isProxyResponseMessage } from '@protocol/messages';
import type { ITransport } from './ITransport';

type PendingProxy = {
  resolve: (response: ProxyResponseMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ProxyClient {
  private pending = new Map<string, PendingProxy>();

  constructor(
    private readonly transport: ITransport,
    private readonly defaultTimeoutMs = 30000,
  ) {}

  attach(): void {
    this.transport.onMessage((msg) => this.handleMessage(msg));
  }

  private handleMessage(msg: unknown): void {
    if (!isProxyResponseMessage(msg)) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    pending.resolve(msg);
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; timeoutMs?: number } = {},
  ): Promise<ProxyResponseMessage> {
    const id = randomUUID();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PROXY timeout for ${method} ${path}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      this.transport.send({
        type: 'PROXY_REQUEST',
        id,
        method,
        path,
        query: options.query,
        body: options.body,
      });
    });
  }

  async inventorySync(facilityId: string, devices: unknown[]): Promise<ProxyResponseMessage> {
    return this.request('POST', '/internal/gateway/devices/inventory', {
      body: { facility_id: facilityId, devices, tid: randomUUID() },
    });
  }

  async stateSync(facilityId: string, updates: unknown[]): Promise<ProxyResponseMessage> {
    return this.request('POST', '/internal/gateway/devices/state', {
      body: { facility_id: facilityId, updates, tid: randomUUID() },
    });
  }

  async addLog(facilityId: string, message: string): Promise<ProxyResponseMessage> {
    return this.request('POST', '/internal/gateway/add_log', {
      body: { facility_id: facilityId, message, tid: randomUUID() },
    });
  }

  async accessEvents(facilityId: string, events: unknown[]): Promise<ProxyResponseMessage> {
    return this.request('POST', '/internal/gateway/access-events', {
      body: { facility_id: facilityId, events, tid: randomUUID() },
    });
  }

  dispose(): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('ProxyClient disposed'));
    }
    this.pending.clear();
  }
}
