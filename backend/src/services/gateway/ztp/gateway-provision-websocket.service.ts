import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '@/utils/logger';
import { isValidGatewayUuid } from '@/utils/gateway-auto-register.utils';
import { ZtpPendingStore } from './ztp-pending.store';
import {
  ZTP_PROVISION_PREFIX,
  buildZtpSignPayload,
  isValidCompressedPublicKey,
  verifyZtpSignature,
} from './gateway-ztp-crypto.utils';

type ChallengeState = {
  deviceId: string;
  publicKey: string;
  nonce: string;
  expiresAt: number;
};

/**
 * Provisioning WebSocket on `/ws/gateway-provision`.
 * HELLO → CHALLENGE → AUTH(signature) → WAITING; claim pushes PROVISION_ASSIGNED.
 */
export class GatewayProvisionWebSocketService {
  private static instance: GatewayProvisionWebSocketService;
  private wss: WebSocketServer | null = null;
  private readonly path = '/ws/gateway-provision';
  private readonly pending = ZtpPendingStore.getInstance();
  private readonly challenges = new WeakMap<WebSocket, ChallengeState>();

  public static getInstance(): GatewayProvisionWebSocketService {
    if (!GatewayProvisionWebSocketService.instance) {
      GatewayProvisionWebSocketService.instance = new GatewayProvisionWebSocketService();
    }
    return GatewayProvisionWebSocketService.instance;
  }

  public initialize(server: { on: (event: string, cb: (...args: any[]) => void) => void }): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true, path: this.path });

    server.on('upgrade', (request: IncomingMessage, socket: import('net').Socket, head: Buffer) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        if (url.pathname !== this.path) return;
        this.wss!.handleUpgrade(request, socket as any, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } catch {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    logger.info(`🔌 Gateway provision WebSocket initialized on path ${this.path}`);
  }

  public destroy(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    GatewayProvisionWebSocketService.instance = undefined as unknown as GatewayProvisionWebSocketService;
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      void this.onMessage(ws, data);
    });
    ws.on('close', () => {
      this.pending.removeByWs(ws);
      this.challenges.delete(ws);
    });
  }

  private async onMessage(ws: WebSocket, data: WebSocket.RawData): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(String(data));
    } catch {
      this.send(ws, { type: 'PROVISION_ERROR', code: 'BAD_JSON', message: 'Invalid JSON' });
      return;
    }

    const type = msg?.type;
    if (type === 'PROVISION_HELLO' || type === 'HELLO') {
      const deviceId = String(msg.device_id || msg.deviceId || '');
      const publicKey = String(msg.public_key || msg.publicKey || '');
      if (!isValidGatewayUuid(deviceId) || !publicKey) {
        this.send(ws, {
          type: 'PROVISION_ERROR',
          code: 'BAD_REQUEST',
          message: 'device_id (UUID) and public_key required',
        });
        return;
      }
      if (!isValidCompressedPublicKey(publicKey)) {
        this.send(ws, {
          type: 'PROVISION_ERROR',
          code: 'BAD_REQUEST',
          message: 'public_key must be a valid compressed P-256 key (base64url)',
        });
        return;
      }
      const nonce = this.pending.createNonce();
      this.challenges.set(ws, {
        deviceId,
        publicKey,
        nonce,
        expiresAt: Date.now() + 60_000,
      });
      this.send(ws, { type: 'PROVISION_CHALLENGE', nonce, expires_in_seconds: 60 });
      return;
    }

    if (type === 'PROVISION_AUTH' || type === 'AUTH') {
      const challenge = this.challenges.get(ws);
      if (!challenge || Date.now() > challenge.expiresAt) {
        this.send(ws, { type: 'PROVISION_ERROR', code: 'CHALLENGE_EXPIRED', message: 'Request a new challenge' });
        return;
      }
      const signature = String(msg.signature || msg.proof || '');
      const payload = buildZtpSignPayload(ZTP_PROVISION_PREFIX, challenge.nonce, challenge.deviceId);
      if (!verifyZtpSignature(challenge.publicKey, payload, signature)) {
        this.send(ws, { type: 'PROVISION_ERROR', code: 'AUTH_FAILED', message: 'Invalid signature' });
        try {
          ws.close(4001, 'auth_failed');
        } catch {
          /* ignore */
        }
        return;
      }
      this.challenges.delete(ws);
      this.pending.put({
        deviceId: challenge.deviceId,
        publicKey: challenge.publicKey,
        ws,
        nonce: challenge.nonce,
      });
      this.send(ws, { type: 'PROVISION_WAITING', device_id: challenge.deviceId });
      return;
    }

    if (type === 'PROVISION_ACK') {
      // Client acknowledged ASSIGNED; allow socket close
      return;
    }
  }

  private send(ws: WebSocket, obj: unknown): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    } catch {
      /* ignore */
    }
  }
}
