import WebSocket from 'ws';
import { wsGatewayUrl } from '@protocol/constants';
import type { AuthMessage, AuthOkMessage, GatewaySessionRole, GatewayWsMessage } from '@protocol/messages';
import { isAuthOkMessage, isErrorMessage, parseJsonMessage } from '@protocol/messages';
import { ConnectionHealthMonitor } from './ConnectionHealthMonitor';
import { summarizeGatewayMessage } from './gateway-message.utils';
import type { ITransport, TransportCloseHandler, TransportEventHandler } from './ITransport';
import {
  ZTP_GW_AUTH_PREFIX,
  buildZtpSignPayload,
  signZtpPayload,
} from '../auth/ztp-keypair.utils';

export type GatewayAuthMode = 'legacy_jwt' | 'ztp_keypair';

export type GatewayConnectionOptions = {
  backendUrl: string;
  /** Required for legacy_jwt */
  token?: string;
  facilityId: string;
  gatewayId: string;
  /** Reported on WS AUTH; seeds gateways.firmware_version on the cloud. */
  firmwareVersion?: string;
  /** Default legacy_jwt */
  authMode?: GatewayAuthMode;
  /** PKCS8 PEM when authMode is ztp_keypair */
  ztpPrivateKeyPem?: string;
  onLog?: (direction: 'in' | 'out' | 'system', summary: string, payload?: unknown) => void;
  /** Fired when AUTH_OK updates session role on an existing connection (e.g. after swap complete). */
  onSessionRoleChanged?: (auth: AuthOkMessage, previousRole?: GatewaySessionRole) => void;
  /** Fired when active WS/JSON heartbeats fail repeatedly. */
  onUnhealthy?: (reason: string) => void;
};

export class GatewayConnection implements ITransport {
  private ws: WebSocket | null = null;
  private handlers: TransportEventHandler[] = [];
  private closeHandler: TransportCloseHandler | null = null;
  private authOk: AuthOkMessage | null = null;
  private health: ConnectionHealthMonitor | null = null;

  constructor(private readonly options: GatewayConnectionOptions) {}

  getAuthOk(): AuthOkMessage | null {
    return this.authOk;
  }

  /** Call after sending JSON PONG in response to a server PING. */
  noteJsonPongSent(): void {
    this.health?.noteJsonPongSent();
  }

  private applyAuthOk(parsed: AuthOkMessage): boolean {
    if (parsed.facilityId !== this.options.facilityId) return false;
    const previousRole = this.authOk?.sessionRole;
    this.authOk = parsed;
    if (previousRole !== parsed.sessionRole) {
      this.options.onSessionRoleChanged?.(parsed, previousRole);
    }
    return true;
  }

  private inboundMessageType(parsed: unknown): string | undefined {
    if (!parsed || typeof parsed !== 'object') return undefined;
    const type = (parsed as { type?: unknown }).type;
    return typeof type === 'string' ? type : undefined;
  }

  private startHealthMonitor(ws: WebSocket): void {
    this.stopHealthMonitor();
    this.health = new ConnectionHealthMonitor({
      wsPing: () => {
        ws.ping();
      },
      onLog: (summary) => this.options.onLog?.('system', summary),
      onUnhealthy: (reason) => {
        this.options.onLog?.('system', `Connection unhealthy: ${reason}`);
        this.options.onUnhealthy?.(reason);
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
      },
    });
    this.health.start(ws);
  }

  private stopHealthMonitor(): void {
    this.health?.stop();
    this.health = null;
  }

  async connect(): Promise<void> {
    const url = wsGatewayUrl(this.options.backendUrl);
    this.options.onLog?.('system', `Connecting to ${url}`);

    this.ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });

    let authInterceptor: TransportEventHandler | null = null;
    const authMode = this.options.authMode || 'legacy_jwt';

    const authPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('AUTH timeout')), 15000);
      authInterceptor = (parsed: unknown) => {
        if (isErrorMessage(parsed)) {
          clearTimeout(timeout);
          reject(new Error(`${parsed.code}: ${parsed.message}`));
          return;
        }
        if (
          authMode === 'ztp_keypair' &&
          parsed &&
          typeof parsed === 'object' &&
          (parsed as { type?: string }).type === 'AUTH_CHALLENGE'
        ) {
          const nonce = String((parsed as { nonce?: string }).nonce || '');
          const pem = this.options.ztpPrivateKeyPem;
          if (!pem || !nonce) {
            clearTimeout(timeout);
            reject(new Error('ZTP AUTH_CHALLENGE missing nonce or private key'));
            return;
          }
          const payload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, nonce, this.options.gatewayId);
          const signature = signZtpPayload(pem, payload);
          this.send({ type: 'AUTH_PROOF', signature });
          this.options.onLog?.('out', 'AUTH_PROOF sent', { gatewayId: this.options.gatewayId });
          return;
        }
        if (isAuthOkMessage(parsed)) {
          if (parsed.facilityId !== this.options.facilityId) {
            clearTimeout(timeout);
            reject(new Error('AUTH_OK facility mismatch'));
            return;
          }
          clearTimeout(timeout);
          resolve();
        }
      };
      this.handlers.unshift(authInterceptor);
    });

    this.ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = parseJsonMessage(data as Buffer);
      } catch {
        this.options.onLog?.('in', 'Invalid JSON message', String(data));
        return;
      }
      this.health?.noteInboundMessageType(this.inboundMessageType(parsed));
      this.options.onLog?.('in', summarizeGatewayMessage(parsed), parsed);
      if (isAuthOkMessage(parsed)) {
        this.applyAuthOk(parsed);
      }
      for (const handler of [...this.handlers]) {
        handler(parsed);
      }
    });

    this.ws.on('ping', () => {
      this.health?.noteServerWsPing();
    });

    this.ws.on('pong', () => {
      this.health?.noteWsPong();
    });

    this.ws.on('error', (err) => {
      this.options.onLog?.('system', `WebSocket error: ${err instanceof Error ? err.message : String(err)}`);
      try {
        this.ws?.terminate();
      } catch {
        /* ignore */
      }
    });

    this.ws.on('close', (code, reason) => {
      this.stopHealthMonitor();
      this.options.onLog?.('system', `Disconnected (${code})`, reason.toString());
      this.closeHandler?.(code, reason.toString());
    });

    if (authMode === 'ztp_keypair') {
      if (!this.options.ztpPrivateKeyPem) {
        throw new Error('ztpPrivateKeyPem required for ztp_keypair auth');
      }
      this.send({
        type: 'AUTH_HELLO',
        gatewayId: this.options.gatewayId,
        facilityId: this.options.facilityId,
        firmware_version: this.options.firmwareVersion?.trim() || undefined,
      });
      this.options.onLog?.('out', 'AUTH_HELLO sent', {
        gatewayId: this.options.gatewayId,
        facilityId: this.options.facilityId,
        firmware_version: this.options.firmwareVersion,
      });
    } else {
      if (!this.options.token) {
        throw new Error('token required for legacy_jwt auth');
      }
      const authMsg: AuthMessage = {
        type: 'AUTH',
        token: this.options.token,
        facilityId: this.options.facilityId,
        gatewayId: this.options.gatewayId,
        firmware_version: this.options.firmwareVersion?.trim() || undefined,
      };
      this.send(authMsg);
      this.options.onLog?.('out', 'AUTH sent', {
        facilityId: this.options.facilityId,
        gatewayId: this.options.gatewayId,
        firmware_version: authMsg.firmware_version,
      });
    }

    try {
      await authPromise;
      this.startHealthMonitor(this.ws);
    } finally {
      if (authInterceptor) {
        this.handlers = this.handlers.filter((h) => h !== authInterceptor);
      }
    }
  }

  disconnect(): void {
    this.stopHealthMonitor();
    this.ws?.close();
    this.ws = null;
    this.authOk = null;
    this.handlers = [];
  }

  send(message: GatewayWsMessage | Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(message));
    this.options.onLog?.('out', summarizeGatewayMessage(message), message);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onMessage(handler: TransportEventHandler): void {
    this.handlers.push(handler);
  }

  onClose(handler: TransportCloseHandler): void {
    this.closeHandler = handler;
  }

  onOpen(_handler: () => void): void {
    // open completes before AUTH in connect()
  }
}
