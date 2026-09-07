import { Server as HTTPServer } from 'http';
import { Socket } from 'net';
import WebSocket, { WebSocketServer } from 'ws';
import { GatewayTransport } from './gateway-transport.interface';
import { logger } from '@/utils/logger';
import { ApiProxyService } from './api-proxy.service';
import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT } from '@/constants/firmware-chunk.constants';
import type { GatewaySessionRole } from './message-types';
import {
  GatewayWsSessionRegistry,
  type AuthedClient,
  type RemoteWebSocket,
  getRemoteAddress,
  safeSend,
} from './gateway-ws-session-registry';
import { GatewayWsAuthHelper } from './gateway-ws-auth';
import { GatewayWsMessageDispatcher } from './gateway-ws-message-dispatcher';

/**
 * WebsocketGatewayTransport
 *
 * A facility-scoped WebSocket gateway transport that:
 * - Authenticates with JWT or ECDSA and binds ONE facility per connection
 * - Proxies API requests over loopback HTTP (maintainable, decoupled)
 * - Delivers gateway commands via unicast/broadcast
 * - Maintains heartbeats and basic backpressure handling
 */
export class WebsocketGatewayTransport implements GatewayTransport {
  private wss?: WebSocketServer;
  private shuttingDown = false;
  private readonly path = '/ws/gateway';

  // ── Composed modules ──
  private readonly registry = new GatewayWsSessionRegistry();
  private readonly authHelper = new GatewayWsAuthHelper();
  private readonly dispatcher: GatewayWsMessageDispatcher;

  // ── Keepalive / heartbeat constants ──
  private static readonly WS_FRAME_PING_MS = 20_000;
  private static readonly JSON_PING_AFTER_IDLE_MS = 10_000;
  private static readonly INACTIVITY_TIMEOUT_MS = 30_000;
  private static readonly HEARTBEAT_SWEEP_MS = 5_000;
  private static readonly TCP_KEEPALIVE_MS = 30_000;

  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.dispatcher = new GatewayWsMessageDispatcher({
      registry: this.registry,
      authHelper: this.authHelper,
      apiProxy: ApiProxyService.getInstance(),
      scheduleActiveSessionCommandFlush: this.scheduleActiveSessionCommandFlush.bind(this),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GatewayTransport interface implementation
  // ─────────────────────────────────────────────────────────────────────────

  public initialize(server: HTTPServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({
      noServer: true,
      path: this.path,
      maxPayload: Number(process.env.GATEWAY_MAX_MESSAGE_BYTES) || GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT,
    });

    server.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        if (url.pathname !== this.path) return;
        const remote = (request.socket as any)?.remoteAddress || (request.headers['x-forwarded-for'] as string) || 'unknown';
        logger.info(`Gateway WS upgrade requested from ${remote} path=${url.pathname}`);
        this.wss!.handleUpgrade(request, socket as any, head, (ws) => {
          try {
            (ws as any).__remote = remote;
            logger.info(`Gateway WS connection upgraded for path=${url.pathname} remote=${remote}`);
          } catch {}
          this.bindConnection(ws as RemoteWebSocket);
        });
      } catch (e) {
        logger.warn('WS upgrade failed:', e);
        try { socket.destroy(); } catch {}
      }
    });

    this.startHeartbeat();
    logger.info(`WebsocketGatewayTransport listening on ${this.path}`);
  }

  public broadcast(payload: any): void {
    const data = JSON.stringify(payload);
    for (const client of this.registry.getFacilityToClientMap().values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  public unicastToFacility(facilityId: string, payload: any): void {
    const { client, isRecoveryPush } = this.registry.getUnicastTarget(facilityId, payload);
    if (!client) {
      if (!isRecoveryPush) {
        logger.warn(`No connected gateway for facility ${facilityId} - command dropped`);
      }
      return;
    }
    this.sendToClient(client, facilityId, payload);
  }

  public setConnectionChangeListener(listener: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }) => void): () => void {
    return this.registry.setConnectionChangeListener(listener);
  }

  public getConnectedFacilityIds(): string[] {
    return this.registry.getConnectedFacilityIds();
  }

  public shutdown(): void {
    this.shuttingDown = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.registry.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public session/recovery methods (delegated to registry)
  // ─────────────────────────────────────────────────────────────────────────

  public getRecoveryPushGatewayId(facilityId: string): string | undefined {
    return this.registry.getRecoveryPushGatewayId(facilityId);
  }

  public isRecoveryPushTargetOnline(facilityId: string): boolean {
    return this.registry.isRecoveryPushTargetOnline(facilityId);
  }

  public getActiveConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
    return this.registry.getActiveConnectionStatusForFacility(facilityId);
  }

  public validateRecoveryInboundSession(
    facilityId: string,
    gatewayId: string | undefined,
    sessionRole: GatewaySessionRole,
  ): { accepted: true } | { accepted: false; reason: string } {
    return this.registry.validateRecoveryInboundSession(facilityId, gatewayId, sessionRole);
  }

  public setRecoveryPushTarget(facilityId: string, gatewayId: string | null): void {
    this.registry.setRecoveryPushTarget(facilityId, gatewayId);
  }

  public getSwapCandidatesForFacility(facilityId: string): Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> {
    return this.registry.getSwapCandidatesForFacility(facilityId);
  }

  public getFacilityGatewaySessions(facilityId: string): Array<{
    gatewayId: string;
    sessionRole: 'active' | 'swap_candidate';
    connected: boolean;
    lastActivityAt?: number;
  }> {
    return this.registry.getFacilityGatewaySessions(facilityId);
  }

  public isGatewayWsConnected(facilityId: string, gatewayId: string): boolean {
    return this.registry.isGatewayWsConnected(facilityId, gatewayId);
  }

  public enrichSessionsForCompletedRecovery(
    facilityId: string,
    sessions: Array<{
      gatewayId: string;
      sessionRole: 'active' | 'swap_candidate';
      connected: boolean;
      lastActivityAt?: number;
    }>,
    productionGatewayId: string | null | undefined,
    previousGatewayId: string | null | undefined,
  ): Array<{
    gatewayId: string;
    sessionRole: 'active' | 'swap_candidate';
    connected: boolean;
    lastActivityAt?: number;
  }> {
    return this.registry.enrichSessionsForCompletedRecovery(facilityId, sessions, productionGatewayId, previousGatewayId);
  }

  public promoteSwapCandidateToActive(facilityId: string, gatewayId: string): void {
    this.registry.promoteSwapCandidateToActive(facilityId, gatewayId, (client) => {
      this.sendSessionRoleAuthOk(client);
    });
  }

  public finalizeRecoverySession(
    facilityId: string,
    newGatewayId: string,
    previousGatewayId: string | null,
  ): void {
    this.registry.finalizeRecoverySession(facilityId, newGatewayId, previousGatewayId, (client) => {
      this.sendSessionRoleAuthOk(client);
    });
  }

  public getConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
    return this.registry.getConnectionStatusForFacility(facilityId);
  }

  public forceDisconnectFacility(facilityId: string, reason = 'force_disconnect'): void {
    this.registry.forceDisconnectFacility(facilityId, reason);
  }

  public forceDisconnectGatewayById(gatewayId: string, reason = 'force_disconnect'): void {
    this.registry.forceDisconnectGatewayById(gatewayId, reason);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  private sendSessionRoleAuthOk(client: AuthedClient): void {
    void (async () => {
      let ops_public_key_pem: string | undefined;
      try { ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem(); } catch {}
      safeSend(client.ws, {
        type: 'AUTH_OK',
        facilityId: client.facilityId,
        gatewayId: client.gatewayId,
        sessionRole: client.sessionRole,
        ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
        ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
        ops_public_key_pem,
      });
    })();
  }

  private sendToClient(client: AuthedClient, facilityId: string, payload: any): void {
    if (client.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Gateway socket not open for facility ${facilityId}`);
      return;
    }
    let message: string;
    let msgType = 'unknown';

    if (typeof payload === 'string' && payload.includes('.')) {
      message = JSON.stringify({ type: 'COMMAND', jwt: payload });
      try {
        const parts = payload.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          msgType = decoded?.cmd_type || 'JWT_COMMAND';
        }
      } catch { msgType = 'JWT_COMMAND'; }
    } else {
      message = JSON.stringify(payload);
      msgType = (payload && typeof payload === 'object' && (payload.type || payload.cmd_type)) || typeof payload;
    }

    client.ws.send(message);
    try {
      GatewayDebugService.getInstance().publish({
        kind: 'message_outbound',
        facilityId,
        type: String(msgType),
        direction: 'outgoing',
        ts: Date.now(),
        lastActivityAt: client.lastActivityAt,
      });
    } catch {}
  }

  private scheduleActiveSessionCommandFlush(facilityId: string): void {
    import('@/services/access-code.service')
      .then(({ AccessCodeService }) => {
        AccessCodeService.getInstance()
          .pushCodesToGateway(facilityId)
          .catch((err) => {
            logger.warn(`Failed to push access codes after AUTH for facility=${facilityId}`, err);
          });
      })
      .catch(() => {});
    import('@/services/denylist-sync.service')
      .then(({ DenylistSyncService }) => {
        DenylistSyncService.pushSnapshotToFacility(facilityId).catch((err) => {
          logger.warn(`Failed to push denylist snapshot after AUTH for facility=${facilityId}`, err);
        });
      })
      .catch(() => {});
    import('@/services/device-deletion-outbox.service')
      .then(({ DeviceDeletionOutboxService }) => {
        DeviceDeletionOutboxService.getInstance()
          .flushPendingForFacility(facilityId)
          .catch((err) => {
            logger.warn(`Failed to flush device deletion outbox for facility=${facilityId}`, err);
          });
      })
      .catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection binding and message dispatch
  // ─────────────────────────────────────────────────────────────────────────

  private bindConnection(ws: RemoteWebSocket): void {
    let authed: AuthedClient | null = null;
    let framePingTimer: ReturnType<typeof setInterval> | undefined;

    const clearFramePingTimer = () => {
      if (framePingTimer) {
        clearInterval(framePingTimer);
        framePingTimer = undefined;
      }
    };

    // TCP keepalive
    try {
      const sock = (ws as unknown as { _socket?: Socket })._socket;
      if (sock) {
        sock.setKeepAlive(true, WebsocketGatewayTransport.TCP_KEEPALIVE_MS);
        sock.setNoDelay(true);
      }
    } catch {}

    const closeAndCleanup = (reason = 'socket_closed') => {
      clearFramePingTimer();
      if (this.shuttingDown) {
        try { ws.terminate(); } catch {}
        return;
      }
      if (authed) {
        const remote = getRemoteAddress(ws);
        if (authed.sessionRole === 'swap_candidate' && authed.gatewayId) {
          const key = `${authed.facilityId}:${authed.gatewayId}`;
          const current = this.registry.getSwapCandidate(key);
          if (current?.ws === ws) {
            this.registry.deleteSwapCandidate(key);
            logger.info(`Swap candidate disconnected facility=${authed.facilityId} gateway=${authed.gatewayId}`);
            import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
              void GatewayRecoveryService.handleRecoveryPushTargetDisconnect(authed!.facilityId, authed!.gatewayId!);
            }).catch(() => {});
          }
        } else {
          const current = this.registry.getActiveClient(authed.facilityId);
          if (current?.ws === ws) {
            this.registry.deleteActiveClient(authed.facilityId);
            this.registry.notifyConnectionChange(
              authed.facilityId,
              false,
              reason,
              authed.lastActivityAt,
              authed.user.userId,
              remote,
            );
            logger.info(`Gateway disconnected for facility ${authed.facilityId} (user=${authed.user.userId})`);
            GatewayDebugService.getInstance().publish({
              kind: 'connection_closed',
              facilityId: authed.facilityId,
              userId: authed.user.userId,
              ts: Date.now(),
              lastActivityAt: authed.lastActivityAt,
            });
            import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
              void FirmwareService.handleFacilityDisconnect(authed!.facilityId, { disconnectedSessionRole: 'active' });
            }).catch(() => {});
          }
        }
      }
      try { ws.close(); } catch {}
    };

    ws.on('pong', () => {
      if (authed) {
        authed.lastActivityAt = Date.now();
      }
    });

    framePingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.ping(); } catch {}
    }, WebsocketGatewayTransport.WS_FRAME_PING_MS);
    framePingTimer.unref();

    ws.on('message', async (raw: WebSocket.RawData) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch {
        logger.warn('Gateway WS received non-JSON message, ignoring');
        return;
      }

      await this.dispatcher.dispatch(
        {
          ws,
          authed,
          setAuthed: (client) => { authed = client; },
          closeAndCleanup,
        },
        msg,
      );
    });

    ws.on('close', (code, reasonBuffer) => {
      const reason = (() => {
        try {
          if (!reasonBuffer) return '';
          return reasonBuffer.toString('utf8');
        } catch {
          return '';
        }
      })();
      logger.warn(`Gateway WS close event code=${code} reason=${reason || '<empty>'}`);
      const cleanupReason = code === 4000 ? 'replaced' : 'close_event';
      closeAndCleanup(cleanupReason);
    });
    ws.on('error', (err) => {
      logger.warn('Gateway WS error:', err);
      closeAndCleanup('socket_error');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Heartbeat
  // ─────────────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      this.sweepHeartbeatClients(this.registry.getFacilityToClientMap(), (facilityId) => {
        this.registry.deleteActiveClient(facilityId);
      }, now);
      this.sweepHeartbeatClients(this.registry.getSwapCandidatesMap(), (key) => {
        this.registry.deleteSwapCandidate(key);
      }, now, true);
    }, WebsocketGatewayTransport.HEARTBEAT_SWEEP_MS);
    this.heartbeatTimer.unref();
  }

  private sweepHeartbeatClients(
    clients: Map<string, AuthedClient>,
    onRemove: (key: string) => void,
    now: number,
    isSwapCandidate = false,
  ): void {
    for (const [key, client] of clients.entries()) {
      const facilityId = isSwapCandidate ? key.split(':')[0] : key;
      if (client.ws.readyState !== WebSocket.OPEN) {
        onRemove(key);
        if (!isSwapCandidate) {
          this.registry.notifyConnectionChange(
            facilityId,
            false,
            'socket_not_open',
            client.lastActivityAt,
            client.user.userId,
            getRemoteAddress(client.ws),
          );
        }
        continue;
      }
      const inactiveMs = now - client.lastActivityAt;
      if (inactiveMs > WebsocketGatewayTransport.INACTIVITY_TIMEOUT_MS) {
        logger.warn(`Gateway heartbeat inactivity timeout, closing facility ${facilityId}${isSwapCandidate ? ' (swap candidate)' : ''}`);
        try { client.ws.close(4001, 'heartbeat timeout'); } catch {}
        onRemove(key);
        if (!isSwapCandidate) {
          this.registry.notifyConnectionChange(
            facilityId,
            false,
            'heartbeat_timeout',
            client.lastActivityAt,
            client.user.userId,
            getRemoteAddress(client.ws),
          );
          GatewayDebugService.getInstance().publish({
            kind: 'heartbeat_timeout',
            facilityId,
            ts: now,
            lastActivityAt: client.lastActivityAt,
          });
        }
        continue;
      }
      if (inactiveMs >= WebsocketGatewayTransport.JSON_PING_AFTER_IDLE_MS) {
        safeSend(client.ws, { type: 'PING' });
        if (!isSwapCandidate) {
          GatewayDebugService.getInstance().publish({
            kind: 'ping_sent',
            facilityId,
            ts: now,
            lastActivityAt: client.lastActivityAt,
          });
        }
      }
    }
  }
}
