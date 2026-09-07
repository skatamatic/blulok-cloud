import { randomBytes } from 'crypto';
import type { WebSocket } from 'ws';

export type ZtpPendingSession = {
  deviceId: string;
  publicKey: string;
  nonce: string;
  verifiedAt: number;
  expiresAt: number;
  ws: WebSocket;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * In-process waiting room for unclaimed gateways on /ws/gateway-provision.
 * Same multi-instance constraint as facilityToClient (prefer max-instances=1).
 */
export class ZtpPendingStore {
  private static instance: ZtpPendingStore;
  private readonly byDeviceId = new Map<string, ZtpPendingSession>();
  private readonly ttlMs: number;

  private constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  public static getInstance(): ZtpPendingStore {
    if (!ZtpPendingStore.instance) {
      ZtpPendingStore.instance = new ZtpPendingStore();
    }
    return ZtpPendingStore.instance;
  }

  /** Test helper — reset singleton. */
  public static resetInstanceForTests(): void {
    ZtpPendingStore.instance = undefined as unknown as ZtpPendingStore;
  }

  public createNonce(): string {
    return randomBytes(32).toString('base64url');
  }

  public put(session: Omit<ZtpPendingSession, 'verifiedAt' | 'expiresAt' | 'nonce'> & { nonce?: string }): ZtpPendingSession {
    this.purgeExpired();
    const previous = this.byDeviceId.get(session.deviceId);
    if (previous && previous.ws !== session.ws) {
      try {
        previous.ws.close(4000, 'replaced');
      } catch {
        /* ignore */
      }
    }
    const now = Date.now();
    const full: ZtpPendingSession = {
      deviceId: session.deviceId,
      publicKey: session.publicKey,
      nonce: session.nonce || this.createNonce(),
      verifiedAt: now,
      expiresAt: now + this.ttlMs,
      ws: session.ws,
    };
    this.byDeviceId.set(session.deviceId, full);
    return full;
  }

  public get(deviceId: string): ZtpPendingSession | null {
    this.purgeExpired();
    const s = this.byDeviceId.get(deviceId);
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      this.byDeviceId.delete(deviceId);
      return null;
    }
    return s;
  }

  public remove(deviceId: string): void {
    this.byDeviceId.delete(deviceId);
  }

  public removeByWs(ws: WebSocket): void {
    for (const [id, s] of this.byDeviceId) {
      if (s.ws === ws) {
        this.byDeviceId.delete(id);
        return;
      }
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, s] of this.byDeviceId) {
      if (now > s.expiresAt) this.byDeviceId.delete(id);
    }
  }
}
