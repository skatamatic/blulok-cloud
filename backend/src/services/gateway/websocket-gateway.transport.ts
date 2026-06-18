import { Server as HTTPServer } from 'http';
import { Socket } from 'net';
import WebSocket, { WebSocketServer } from 'ws';
import { GatewayTransport } from './gateway-transport.interface';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { ApiProxyService } from './api-proxy.service';
import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT } from '@/constants/firmware-chunk.constants';
import { isRecoveryOutboundMessage } from '@/utils/gateway-recovery-outbound.utils';
import { validateRecoveryInboundSession } from '@/utils/gateway-recovery-inbound.utils';
import { isValidGatewayUuid, type AutoRegisterReject } from '@/utils/gateway-auto-register.utils';

type JWTPayload = {
  userId: string;
  role: UserRole;
  facilityIds?: string[];
  email?: string;
};

type RemoteWebSocket = WebSocket & { __remote?: string };

import type { GatewaySessionRole } from './message-types';

type AuthedClient = {
  ws: RemoteWebSocket;
  user: JWTPayload;
  facilityId: string;
  gatewayId?: string;
  sessionRole: GatewaySessionRole;
  /** Timestamp of last observed activity (any valid message or PONG) */
  lastActivityAt: number;
};

/**
 * WebsocketGatewayTransport
 *
 * A facility-scoped WebSocket gateway transport that:
 * - Authenticates with JWT and binds ONE facility per connection
 * - Proxies API requests over loopback HTTP (maintainable, decoupled)
 * - Delivers gateway commands via unicast/broadcast
 * - Maintains heartbeats and basic backpressure handling
 */
export class WebsocketGatewayTransport implements GatewayTransport {
  private wss?: WebSocketServer;
  private facilityToClient = new Map<string, AuthedClient>();
  /** Parked swap-candidate sessions keyed by `${facilityId}:${gatewayId}` */
  private swapCandidates = new Map<string, AuthedClient>();
  /** When set, recovery-related unicast routes to the swap candidate WS */
  private recoveryPushGatewayByFacility = new Map<string, string>();
  private readonly path = '/ws/gateway';

  // ── Keepalive / heartbeat constants ──
  // RFC6455 ping frames every 20s: keeps NAT tables, LBs, and proxies alive
  // (shortest common idle timeout is ~60s on AWS ALB; 300s on NATs; 600s on Cloud Run).
  private static readonly WS_FRAME_PING_MS = 20_000;
  // JSON PING sent after 10s of inactivity (application-level health check).
  private static readonly JSON_PING_AFTER_IDLE_MS = 10_000;
  // Close connection after 30s of total silence (no JSON PONG, no WS pong, no data).
  private static readonly INACTIVITY_TIMEOUT_MS = 30_000;
  // How often we sweep connections for timeouts.
  private static readonly HEARTBEAT_SWEEP_MS = 5_000;
  // TCP keepalive probe interval.
  private static readonly TCP_KEEPALIVE_MS = 30_000;

  // ── Auto-registration guardrails ──
  // Max distinct unbound swap candidates that may be auto-registered/parked per facility.
  private static readonly MAX_SWAP_CANDIDATES_PER_FACILITY = 3;
  // Sliding window for auto-registration rate limiting.
  private static readonly AUTO_REGISTER_WINDOW_MS = 10 * 60_000;
  // Max gateway records auto-created per facility within the window.
  private static readonly AUTO_REGISTER_MAX_PER_WINDOW = 5;
  /** Timestamps of recent auto-create events keyed by facilityId (sliding window). */
  private autoRegisterEvents = new Map<string, number[]>();

  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private connectionChangeListener?: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }) => void;

  public initialize(server: HTTPServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({
      noServer: true,
      path: this.path,
      maxPayload: Number(process.env.GATEWAY_MAX_MESSAGE_BYTES) || GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT,
    });

    // Upgrade handshake: accept TCP, then let AUTH message establish identity
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
          this.bindConnection(ws);
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
    for (const client of this.facilityToClient.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  public unicastToFacility(facilityId: string, payload: any): void {
    const recoveryGatewayId = this.recoveryPushGatewayByFacility.get(facilityId);
    if (recoveryGatewayId && isRecoveryOutboundMessage(payload)) {
      const swapClient = this.swapCandidates.get(`${facilityId}:${recoveryGatewayId}`);
      if (swapClient) {
        this.sendToClient(swapClient, facilityId, payload);
        return;
      }
      logger.warn(
        `Recovery push target offline for facility ${facilityId} gateway ${recoveryGatewayId} — dropping ${payload?.type ?? payload?.cmd_type ?? 'message'}`,
      );
      return;
    }
    const client = this.facilityToClient.get(facilityId);
    if (!client) {
      logger.warn(`No connected gateway for facility ${facilityId} - command dropped`);
      return;
    }
    this.sendToClient(client, facilityId, payload);
  }

  public getRecoveryPushGatewayId(facilityId: string): string | undefined {
    return this.recoveryPushGatewayByFacility.get(facilityId);
  }

  public isRecoveryPushTargetOnline(facilityId: string): boolean {
    const gatewayId = this.recoveryPushGatewayByFacility.get(facilityId);
    if (!gatewayId) return false;
    const client = this.swapCandidates.get(`${facilityId}:${gatewayId}`);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  public getActiveConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const active = this.facilityToClient.get(facilityId);
    if (active && active.ws.readyState === WebSocket.OPEN) {
      return { connected: true, lastPongAt: active.lastActivityAt };
    }
    return { connected: false };
  }

  public validateRecoveryInboundSession(
    facilityId: string,
    gatewayId: string | undefined,
    sessionRole: GatewaySessionRole,
  ): { accepted: true } | { accepted: false; reason: string } {
    return validateRecoveryInboundSession({
      facilityId,
      gatewayId,
      sessionRole,
      recoveryPushGatewayId: this.recoveryPushGatewayByFacility.get(facilityId),
    });
  }

  public setRecoveryPushTarget(facilityId: string, gatewayId: string | null): void {
    if (gatewayId) {
      this.recoveryPushGatewayByFacility.set(facilityId, gatewayId);
    } else {
      this.recoveryPushGatewayByFacility.delete(facilityId);
    }
  }

  public getSwapCandidatesForFacility(facilityId: string): Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> {
    const results: Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> = [];
    for (const [key, client] of this.swapCandidates.entries()) {
      if (!key.startsWith(`${facilityId}:`)) continue;
      const gatewayId = client.gatewayId || key.split(':').slice(1).join(':');
      results.push({
        gatewayId,
        connected: client.ws.readyState === WebSocket.OPEN,
        lastActivityAt: client.lastActivityAt,
      });
    }
    return results;
  }

  /** Number of distinct swap candidate gateways currently parked for a facility. */
  private countSwapCandidatesForFacility(facilityId: string, excludeGatewayId?: string): number {
    const seen = new Set<string>();
    const prefix = `${facilityId}:`;
    for (const [key, client] of this.swapCandidates.entries()) {
      if (!key.startsWith(prefix)) continue;
      const gatewayId = client.gatewayId || key.slice(prefix.length);
      if (excludeGatewayId && gatewayId === excludeGatewayId) continue;
      seen.add(gatewayId);
    }
    return seen.size;
  }

  /**
   * Records an auto-registration event and returns false if the facility has exceeded
   * the sliding-window rate limit. Prunes expired timestamps.
   */
  private allowAutoRegister(facilityId: string): boolean {
    const now = Date.now();
    const windowStart = now - WebsocketGatewayTransport.AUTO_REGISTER_WINDOW_MS;
    const events = (this.autoRegisterEvents.get(facilityId) || []).filter((ts) => ts >= windowStart);
    if (events.length >= WebsocketGatewayTransport.AUTO_REGISTER_MAX_PER_WINDOW) {
      this.autoRegisterEvents.set(facilityId, events);
      return false;
    }
    events.push(now);
    this.autoRegisterEvents.set(facilityId, events);
    return true;
  }

  private async logAutoRegistration(params: {
    facilityId: string;
    gatewayId: string;
    bound: boolean;
    userId: string;
  }): Promise<void> {
    try {
      const { ActivityService } = await import('@/services/activity.service');
      await ActivityService.getInstance().logActivity({
        entityType: 'gateway',
        entityId: params.gatewayId,
        activityType: 'configuration_change',
        title: params.bound ? 'Gateway auto-registered and bound' : 'Gateway auto-registered as swap candidate',
        description: params.bound
          ? 'A new gateway connected and was auto-registered as the facility gateway (first install).'
          : 'A new gateway connected and was auto-registered as an unbound swap candidate.',
        actorType: 'user',
        actorId: params.userId,
        result: 'success',
        facilityId: params.facilityId,
        metadata: { autoRegistered: true, bound: params.bound, gatewayId: params.gatewayId },
      });
    } catch (err) {
      logger.warn(`Failed to log gateway auto-registration facility=${params.facilityId} gateway=${params.gatewayId}`, err);
    }
  }

  private checkAutoRegisterLimits(
    facilityId: string,
    gatewayId: string,
    options: { enforceCandidateCap?: boolean; enforceRateLimit?: boolean },
  ): AutoRegisterReject | null {
    if (!isValidGatewayUuid(gatewayId)) {
      return { code: 'AUTH_BAD_REQUEST', message: 'gatewayId must be a valid UUID' };
    }
    if (options.enforceCandidateCap !== false) {
      const parked = this.countSwapCandidatesForFacility(facilityId, gatewayId);
      if (parked >= WebsocketGatewayTransport.MAX_SWAP_CANDIDATES_PER_FACILITY) {
        return { code: 'AUTH_FORBIDDEN', message: 'Swap candidate limit reached for facility' };
      }
    }
    if (options.enforceRateLimit !== false && !this.allowAutoRegister(facilityId)) {
      return { code: 'AUTH_RATE_LIMITED', message: 'Too many gateway registrations; try again later' };
    }
    return null;
  }

  /**
   * Ensure an unbound gateway row exists for swap-candidate parking (idempotent).
   * Creates the row when absent; safe under concurrent AUTH with the same GUID.
   */
  private async ensureUnboundSwapCandidateRecord(
    gatewayModel: InstanceType<Awaited<typeof import('@/models/gateway.model')>['GatewayModel']>,
    gatewayId: string,
    facilityId: string,
    userId: string,
    options: { enforceCandidateCap?: boolean; enforceRateLimit?: boolean },
  ): Promise<{ ok: true; created: boolean } | { ok: false; reject: AutoRegisterReject }> {
    const existing = await gatewayModel.findById(gatewayId);
    if (existing?.facility_id && existing.facility_id !== facilityId) {
      return { ok: false, reject: { code: 'AUTH_FORBIDDEN', message: 'Gateway belongs to another facility' } };
    }
    if (existing) {
      return { ok: true, created: false };
    }

    const limitReject = this.checkAutoRegisterLimits(facilityId, gatewayId, options);
    if (limitReject) {
      return { ok: false, reject: limitReject };
    }

    const { created } = await gatewayModel.createUnboundSwapCandidateIfAbsent({
      id: gatewayId,
      name: `Swap candidate ${gatewayId.slice(0, 8)}`,
      metadata: { autoRegistered: true },
    });

    if (created) {
      await this.logAutoRegistration({ facilityId, gatewayId, bound: false, userId });
      logger.info(`Gateway WS auto-registered swap candidate facility=${facilityId} gateway=${gatewayId}`);
    }

    return { ok: true, created };
  }

  public promoteSwapCandidateToActive(facilityId: string, gatewayId: string): void {
    const key = `${facilityId}:${gatewayId}`;
    const candidate = this.swapCandidates.get(key);
    if (!candidate) return;

    this.closeActiveSessionForFacility(facilityId, 'recovery_promote', candidate.ws);

    candidate.sessionRole = 'active';
    this.facilityToClient.set(facilityId, candidate);
    this.swapCandidates.delete(key);
    this.recoveryPushGatewayByFacility.delete(facilityId);
    this.notifyConnectionChange(
      facilityId,
      true,
      'recovery_promote',
      candidate.lastActivityAt,
      candidate.user.userId,
      getRemoteAddress(candidate.ws),
    );
  }

  /**
   * After recovery complete/bypass: rebind WS sessions to the new gateway.
   * Always evicts the previous bound session; promotes the swap candidate when connected.
   */
  public finalizeRecoverySession(
    facilityId: string,
    newGatewayId: string,
    previousGatewayId: string | null,
  ): void {
    this.closeActiveSessionForFacility(facilityId, 'recovery_finalize', undefined, previousGatewayId);

    const key = `${facilityId}:${newGatewayId}`;
    const candidate = this.swapCandidates.get(key);
    if (candidate && candidate.ws.readyState === WebSocket.OPEN) {
      candidate.sessionRole = 'active';
      this.facilityToClient.set(facilityId, candidate);
      this.swapCandidates.delete(key);
      this.notifyConnectionChange(
        facilityId,
        true,
        'recovery_finalize',
        candidate.lastActivityAt,
        candidate.user.userId,
        getRemoteAddress(candidate.ws),
      );
    }

    this.recoveryPushGatewayByFacility.delete(facilityId);
  }

  private closeActiveSessionForFacility(
    facilityId: string,
    reason: string,
    exceptWs?: RemoteWebSocket,
    previousGatewayId?: string | null,
  ): void {
    const active = this.facilityToClient.get(facilityId);
    if (!active || active.ws === exceptWs || active.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const shouldClose =
      !previousGatewayId
      || active.gatewayId === previousGatewayId
      || active.gatewayId === undefined
      || active.sessionRole === 'legacy';

    if (!shouldClose) {
      return;
    }

    try { active.ws.close(4000, reason); } catch {}
    this.facilityToClient.delete(facilityId);
    this.notifyConnectionChange(
      facilityId,
      false,
      reason,
      active.lastActivityAt,
      active.user.userId,
      getRemoteAddress(active.ws),
    );
  }

  public getConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const active = this.facilityToClient.get(facilityId);
    if (active && active.ws.readyState === WebSocket.OPEN) {
      return { connected: true, lastPongAt: active.lastActivityAt };
    }
    for (const [key, client] of this.swapCandidates.entries()) {
      if (!key.startsWith(`${facilityId}:`)) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        return { connected: true, lastPongAt: client.lastActivityAt };
      }
    }
    return { connected: false };
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

  public setConnectionChangeListener(listener: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
    userId?: string;
    remoteAddress?: string;
  }) => void): () => void {
    this.connectionChangeListener = listener;
    return () => {
      if (this.connectionChangeListener === listener) {
        this.connectionChangeListener = undefined;
      }
    };
  }

  public getConnectedFacilityIds(): string[] {
    return Array.from(this.facilityToClient.keys());
  }

  private notifyConnectionChange(
    facilityId: string,
    connected: boolean,
    reason?: string,
    lastActivityAt?: number,
    userId?: string,
    remoteAddress?: string,
  ): void {
    if (!this.connectionChangeListener) return;
    try {
      this.connectionChangeListener({
        facilityId,
        connected,
        reason,
        lastActivityAt,
        userId,
        remoteAddress,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.warn('Gateway WS connection change listener failed', error);
    }
  }

  /**
   * Safely extract tid (transaction ID) from request body.
   * Preserves type (number or string) from request.
   * 
   * @param body - Request body (any type)
   * @returns tid if present (number or string), undefined otherwise
   */
  private extractTid(body: any): number | string | undefined {
    if (body && typeof body === 'object' && body !== null && 'tid' in body) {
      const tid = body.tid;
      if (typeof tid === 'number' || typeof tid === 'string') {
        return tid;
      }
    }
    return undefined;
  }

  /**
   * Merge tid into response body while preserving response type.
   * Only adds tid if it's defined.
   * 
   * @param responseBody - Original response body
   * @param tid - Transaction ID to merge (number, string, or undefined)
   * @returns Response body with tid added if provided
   */
  private mergeTidIntoResponse<T>(responseBody: T, tid: number | string | undefined): T & { tid?: number | string } {
    if (tid !== undefined) {
      return { ...responseBody, tid } as T & { tid: number | string };
    }
    return responseBody as T & { tid?: number | string };
  }

  private bindConnection(ws: RemoteWebSocket): void {
    let authed: AuthedClient | null = null;
    let framePingTimer: ReturnType<typeof setInterval> | undefined;

    const clearFramePingTimer = () => {
      if (framePingTimer) {
        clearInterval(framePingTimer);
        framePingTimer = undefined;
      }
    };

    // TCP keepalive: reduces silent drops behind Cloud Run / GLB / NAT.
    try {
      const sock = (ws as unknown as { _socket?: Socket })._socket;
      if (sock) {
        sock.setKeepAlive(true, WebsocketGatewayTransport.TCP_KEEPALIVE_MS);
        sock.setNoDelay(true);
      }
    } catch {
      /* ignore */
    }

    const closeAndCleanup = (reason = 'socket_closed') => {
      clearFramePingTimer();
      if (authed) {
        const remote = getRemoteAddress(ws);
        if (authed.sessionRole === 'swap_candidate' && authed.gatewayId) {
          const key = `${authed.facilityId}:${authed.gatewayId}`;
          const current = this.swapCandidates.get(key);
          if (current?.ws === ws) {
            this.swapCandidates.delete(key);
            logger.info(`Swap candidate disconnected facility=${authed.facilityId} gateway=${authed.gatewayId}`);
            import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
              void GatewayRecoveryService.handleRecoveryPushTargetDisconnect(authed!.facilityId, authed!.gatewayId!);
            }).catch(() => {});
          }
        } else {
          const current = this.facilityToClient.get(authed.facilityId);
          if (current?.ws === ws) {
            this.facilityToClient.delete(authed.facilityId);
            this.notifyConnectionChange(
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
            import('@/services/provisioning/provisioning-restore.service').then(({ ProvisioningRestoreService }) => {
              void ProvisioningRestoreService.handleFacilityDisconnect(authed!.facilityId, { disconnectedSessionRole: 'active' });
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

    // RFC6455 ping frames on a fixed cadence — the single most effective keepalive for
    // intermediaries (load balancers, NAT, Cloud Run ingress) that don't inspect app-level JSON.
    framePingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.ping(); } catch { /* ignore */ }
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

      const typeField = msg?.type;
      const type = typeof typeField === 'string' ? typeField : '';

      if (type === 'PONG') {
        const remote = getRemoteAddress(ws);
        if (authed) {
          logger.debug?.('Gateway WS PONG received', {
            facilityId: authed.facilityId,
            userId: authed.user.userId,
            remote,
          });
          const now = Date.now();
          authed.lastActivityAt = now;
          GatewayDebugService.getInstance().publish({
            kind: 'pong_received',
            facilityId: authed.facilityId,
            userId: authed.user.userId,
            ts: now,
            lastActivityAt: authed.lastActivityAt,
            remote,
          });
          // Acknowledge so gateways can confirm their PONG was processed
          safeSend(ws, { type: 'PONG_OK', ts: Date.now() });
        } else {
          logger.debug?.('Gateway WS PONG received before AUTH completed', { remote });
        }
        return;
      }

      // Any other valid message from the gateway counts as activity/keep-alive
      if (authed) {
        const now = Date.now();
        authed.lastActivityAt = now;
        GatewayDebugService.getInstance().publish({
          kind: 'message_inbound',
          facilityId: authed.facilityId,
          userId: authed.user.userId,
          type,
          direction: 'incoming',
          ts: now,
          lastActivityAt: authed.lastActivityAt,
        });
      }

      if (type === 'AUTH') {
        const remote = getRemoteAddress(ws);
        const token = String(msg?.token || '');
        const facilityId = String(msg?.facilityId || '');
        const decoded = AuthService.verifyToken(token) as JWTPayload | null;
        if (!decoded) {
          logger.warn(`Gateway WS AUTH failed (invalid token) remote=${remote} requestedFacility=${facilityId}`);
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Invalid token' });
          return closeAndCleanup();
        }
        if (![UserRole.FACILITY_ADMIN, UserRole.ADMIN, UserRole.DEV_ADMIN].includes(decoded.role)) {
          logger.warn(`Gateway WS AUTH forbidden (role=${decoded.role}) user=${decoded.userId} remote=${remote} facility=${facilityId}`);
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Insufficient role' });
          return closeAndCleanup();
        }
        if (!facilityId) {
          logger.warn(`Gateway WS AUTH bad request (missing facilityId) user=${decoded.userId} role=${decoded.role} remote=${remote}`);
          safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'facilityId required' });
          return closeAndCleanup();
        }
        // Facility admin must be scoped to this facility (live DB associations, not JWT)
        if (decoded.role === UserRole.FACILITY_ADMIN) {
          const { FacilityAccessService } = await import('@/services/facility-access.service');
          const hasAccess = await FacilityAccessService.hasAccessToFacility(
            decoded.userId,
            decoded.role as UserRole,
            facilityId
          );
          if (!hasAccess) {
            logger.warn(`Gateway WS AUTH forbidden (facility not permitted) user=${decoded.userId} role=${decoded.role} remote=${remote} facility=${facilityId}`);
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Facility not permitted' });
            return closeAndCleanup();
          }
        }
        const gatewayId = typeof msg?.gatewayId === 'string' && msg.gatewayId.length > 0
          ? String(msg.gatewayId)
          : undefined;

        let boundGateway: { id: string } | null = null;
        let gatewayModel: InstanceType<Awaited<typeof import('@/models/gateway.model')>['GatewayModel']> | null = null;
        if (gatewayId) {
          const { GatewayModel } = await import('@/models/gateway.model');
          gatewayModel = new GatewayModel();
          boundGateway = await gatewayModel.findByFacilityId(facilityId);
        }

        let sessionRole: GatewaySessionRole = 'legacy';
        let resolvedGatewayId = gatewayId;
        let autoRegistered = false;

        const setActiveSession = (gid: string | undefined, role: GatewaySessionRole) => {
          const existing = this.facilityToClient.get(facilityId);
          if (existing && existing.ws !== ws && (existing.gatewayId === gid || existing.sessionRole === 'active' || !gid)) {
            try { existing.ws.close(4000, 'replaced'); } catch {}
          }
          const now = Date.now();
          authed = { ws, user: decoded, facilityId, gatewayId: gid, sessionRole: role, lastActivityAt: now };
          this.facilityToClient.set(facilityId, authed);
        };

        const parkSwapCandidate = async (gid: string, boundId: string) => {
          sessionRole = 'swap_candidate';
          resolvedGatewayId = gid;
          const swapKey = `${facilityId}:${gid}`;
          const existingCandidate = this.swapCandidates.get(swapKey);
          if (existingCandidate && existingCandidate.ws !== ws) {
            try { existingCandidate.ws.close(4000, 'replaced'); } catch {}
          }
          const now = Date.now();
          authed = { ws, user: decoded, facilityId, gatewayId: gid, sessionRole, lastActivityAt: now };
          this.swapCandidates.set(swapKey, authed);
          try {
            const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
            await GatewayRecoveryService.detect(facilityId, gid, boundId);
          } catch (err) {
            logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
          }
          logger.info(`Gateway WS swap candidate parked: facility=${facilityId} newGateway=${gid} boundGateway=${boundId}`);
        };

        if (gatewayId && gatewayModel) {
          try {
            if (boundGateway && gatewayId === boundGateway.id) {
              // Known bound gateway reconnecting → active session.
              sessionRole = 'active';
              setActiveSession(gatewayId, 'active');
            } else if (boundGateway) {
              // A different gateway connected while a bound gateway exists → swap candidate.
              const ensured = await this.ensureUnboundSwapCandidateRecord(
                gatewayModel,
                gatewayId,
                facilityId,
                decoded.userId,
                {},
              );
              if (!ensured.ok) {
                logger.warn(
                  `Gateway WS AUTH rejected (swap candidate) facility=${facilityId} gateway=${gatewayId} code=${ensured.reject.code}`,
                );
                safeSend(ws, { type: 'ERROR', code: ensured.reject.code, message: ensured.reject.message });
                return closeAndCleanup();
              }
              if (ensured.created) {
                autoRegistered = true;
              }
              await parkSwapCandidate(gatewayId, boundGateway.id);
            } else {
              // No bound gateway for this facility → first-install auto-bind.
              const existingGateway = await gatewayModel.findById(gatewayId);
              if (existingGateway?.facility_id && existingGateway.facility_id !== facilityId) {
                logger.warn(
                  `Gateway WS AUTH rejected (gateway bound to another facility) gateway=${gatewayId} facility=${facilityId} boundTo=${existingGateway.facility_id}`,
                );
                safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway belongs to another facility' });
                return closeAndCleanup();
              }
              if (!existingGateway) {
                const limitReject = this.checkAutoRegisterLimits(facilityId, gatewayId, {
                  enforceCandidateCap: false,
                });
                if (limitReject) {
                  logger.warn(
                    `Gateway WS AUTH rejected (first-install auto-register) facility=${facilityId} gateway=${gatewayId} code=${limitReject.code}`,
                  );
                  safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
                  return closeAndCleanup();
                }
              }
              const result = await gatewayModel.createOrBindAsFirstGateway({
                id: gatewayId,
                facilityId,
                name: `Gateway ${gatewayId.slice(0, 8)}`,
                metadata: { autoRegistered: true },
              });
              if (result.bound) {
                sessionRole = 'active';
                setActiveSession(gatewayId, 'active');
                if (result.created) {
                  autoRegistered = true;
                  await this.logAutoRegistration({ facilityId, gatewayId, bound: true, userId: decoded.userId });
                  logger.info(`Gateway WS auto-registered + bound first gateway facility=${facilityId} gateway=${gatewayId}`);
                }
              } else {
                // Lost the first-install race — ensure DB row exists, then park as swap candidate.
                const winner = await gatewayModel.findByFacilityId(facilityId);
                if (!winner) {
                  logger.error(
                    `Gateway WS AUTH first-install race without bound winner facility=${facilityId} gateway=${gatewayId}`,
                  );
                  safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Facility gateway binding conflict' });
                  return closeAndCleanup();
                }
                const ensured = await this.ensureUnboundSwapCandidateRecord(
                  gatewayModel,
                  gatewayId,
                  facilityId,
                  decoded.userId,
                  { enforceRateLimit: false },
                );
                if (!ensured.ok) {
                  logger.warn(
                    `Gateway WS AUTH rejected (first-install race fallback) facility=${facilityId} gateway=${gatewayId} code=${ensured.reject.code}`,
                  );
                  safeSend(ws, { type: 'ERROR', code: ensured.reject.code, message: ensured.reject.message });
                  return closeAndCleanup();
                }
                if (ensured.created) {
                  autoRegistered = true;
                }
                await parkSwapCandidate(gatewayId, winner.id);
              }
            }
          } catch (err) {
            logger.error(`Gateway WS AUTH auto-register failed facility=${facilityId} gateway=${gatewayId}`, err);
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway registration failed' });
            return closeAndCleanup();
          }
        } else {
          // Legacy connection (no gatewayId supplied).
          setActiveSession(resolvedGatewayId, 'legacy');
        }

        if (sessionRole === 'active' || sessionRole === 'legacy') {
          this.notifyConnectionChange(facilityId, true, 'auth_ok', authed!.lastActivityAt, decoded.userId, remote);
        }
        let ops_public_key_pem: string | undefined;
        try { ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem(); } catch {}
        safeSend(ws, {
          type: 'AUTH_OK',
          facilityId,
          gatewayId: resolvedGatewayId,
          sessionRole,
          autoRegistered,
          ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
          ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
          ops_public_key_pem,
        });
        logger.info(`Gateway WS authenticated: facility=${facilityId} gateway=${resolvedGatewayId || 'legacy'} role=${sessionRole} user=${decoded.userId} remote=${remote}`);
        GatewayDebugService.getInstance().publish({
          kind: 'connection_opened',
          facilityId,
          userId: decoded.userId,
          ts: authed!.lastActivityAt,
          lastActivityAt: authed!.lastActivityAt,
          remote,
        });
        import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
          FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
          });
        }).catch(() => {});
        import('@/services/provisioning/provisioning-restore.service').then(({ ProvisioningRestoreService }) => {
          ProvisioningRestoreService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume provisioning restores for facility=${facilityId}`, err);
          });
        }).catch(() => {});
        import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
          GatewayRecoveryService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume gateway recovery for facility=${facilityId}`, err);
          });
        }).catch(() => {});
        if (sessionRole === 'active' || sessionRole === 'legacy') {
          import('@/services/access-code.service').then(({ AccessCodeService }) => {
            AccessCodeService.getInstance().flushPendingPushForFacility(facilityId).catch((err) => {
              logger.warn(`Failed to flush access code outbox for facility=${facilityId}`, err);
            });
          }).catch(() => {});
          import('@/services/device-deletion-outbox.service').then(({ DeviceDeletionOutboxService }) => {
            DeviceDeletionOutboxService.getInstance().flushPendingForFacility(facilityId).catch((err) => {
              logger.warn(`Failed to flush device deletion outbox for facility=${facilityId}`, err);
            });
          }).catch(() => {});
        }
        return;
      }

      if (!authed) {
        const remote = getRemoteAddress(ws);
        logger.warn(`Gateway WS message before AUTH (type=${typeField}) remote=${remote} - closing`);
        safeSend(ws, { type: 'ERROR', code: 'NOT_AUTHENTICATED', message: 'Send AUTH first' });
        return;
      }

      if (type === 'PROXY_REQUEST') {
        const id = String(msg?.id || '');
        const method = String(msg?.method || 'GET').toUpperCase();
        const path = String(msg?.path || '/');
        const headers = (msg?.headers || {}) as Record<string, string>;
        const query = msg?.query || undefined;
        const body = msg?.body || undefined;
        const tid = this.extractTid(body);
        try {
          const response = await this.proxyHttp(authed, { method, path, headers, query, body });
          const responseBody = this.mergeTidIntoResponse(response.data, tid);
          safeSend(ws, { type: 'PROXY_RESPONSE', id, status: response.status, headers: response.headers, body: responseBody });
        } catch (e: any) {
          const status = e?.response?.status || 500;
          const data = e?.response?.data || { error: 'Proxy failed' };
          const errorBody = this.mergeTidIntoResponse(data, tid);
          logger.warn(
            `Gateway WS proxy error facility=${authed.facilityId} user=${authed.user.userId} method=${method} path=${path} status=${status} message=${e?.message || 'unknown'} details=${JSON.stringify(e?.response?.data || {})}`,
          );
          safeSend(ws, { type: 'PROXY_RESPONSE', id, status, body: errorBody });
        }
        return;
      }

      // Firmware messages from gateway
      if (type === 'FIRMWARE_CHUNK_ACK' || type === 'FIRMWARE_UPDATE_STATUS' || type === 'FIRMWARE_PROGRESS') {
        const recoveryInbound = this.validateRecoveryInboundSession(authed.facilityId, authed.gatewayId, authed.sessionRole);
        if (!recoveryInbound.accepted) {
          logger.warn(`Gateway WS firmware message rejected facility=${authed.facilityId} reason=${recoveryInbound.reason}`);
          if (type === 'FIRMWARE_UPDATE_STATUS') {
            safeSend(ws, {
              type: 'FIRMWARE_UPDATE_STATUS_ACK',
              push_id: typeof msg?.push_id === 'string' ? msg.push_id : msg?.pushId,
              accepted: false,
              reason: recoveryInbound.reason,
            });
          }
          return;
        }
        try {
          const { FirmwareService } = await import('@/services/firmware/firmware.service');
          if (type === 'FIRMWARE_CHUNK_ACK') {
            await FirmwareService.handleChunkAck(authed.facilityId, msg);
          } else if (type === 'FIRMWARE_UPDATE_STATUS') {
            const result = await FirmwareService.handleUpdateStatus(authed.facilityId, msg);
            const ackPushId = result.push_id
              ?? (typeof msg?.push_id === 'string' ? msg.push_id : (typeof msg?.pushId === 'string' ? msg.pushId : undefined));
            safeSend(ws, {
              type: 'FIRMWARE_UPDATE_STATUS_ACK',
              push_id: ackPushId,
              accepted: result.accepted,
              push_status: result.push_status,
              reason: result.reason,
            });
          } else {
            await FirmwareService.handleProgress(authed.facilityId, msg);
          }
        } catch (err) {
          logger.warn(`Gateway WS firmware message handling error type=${type} facility=${authed.facilityId}`, err);
        }
        return;
      }

      // Provisioning restore messages from gateway
      if (type === 'PROVISIONING_CHUNK_ACK' || type === 'PROVISIONING_RESTORE_STATUS') {
        const recoveryInbound = this.validateRecoveryInboundSession(authed.facilityId, authed.gatewayId, authed.sessionRole);
        if (!recoveryInbound.accepted) {
          logger.warn(`Gateway WS provisioning message rejected facility=${authed.facilityId} reason=${recoveryInbound.reason}`);
          if (type === 'PROVISIONING_RESTORE_STATUS') {
            safeSend(ws, {
              type: 'PROVISIONING_RESTORE_STATUS_ACK',
              restore_id: typeof msg?.restore_id === 'string' ? msg.restore_id : msg?.restoreId,
              accepted: false,
              reason: recoveryInbound.reason,
            });
          }
          return;
        }
        try {
          const { ProvisioningRestoreService } = await import('@/services/provisioning/provisioning-restore.service');
          if (type === 'PROVISIONING_CHUNK_ACK') {
            await ProvisioningRestoreService.handleChunkAck(authed.facilityId, msg);
          } else {
            const result = await ProvisioningRestoreService.handleRestoreStatus(authed.facilityId, msg);
            const ackRestoreId = result.restore_id
              ?? (typeof msg?.restore_id === 'string' ? msg.restore_id : (typeof msg?.restoreId === 'string' ? msg.restoreId : undefined));
            safeSend(ws, {
              type: 'PROVISIONING_RESTORE_STATUS_ACK',
              restore_id: ackRestoreId,
              accepted: result.accepted,
              restore_status: result.restore_status,
              reason: result.reason,
            });
          }
        } catch (err) {
          logger.warn(`Gateway WS provisioning message handling error type=${type} facility=${authed.facilityId}`, err);
        }
        return;
      }

      // Inventory snapshot messages from gateway (swap recovery)
      if (type === 'INVENTORY_SNAPSHOT_CHUNK_ACK' || type === 'INVENTORY_SNAPSHOT_STATUS') {
        const recoveryInbound = this.validateRecoveryInboundSession(authed.facilityId, authed.gatewayId, authed.sessionRole);
        if (!recoveryInbound.accepted) {
          logger.warn(`Gateway WS inventory snapshot message rejected facility=${authed.facilityId} reason=${recoveryInbound.reason}`);
          if (type === 'INVENTORY_SNAPSHOT_STATUS') {
            safeSend(ws, {
              type: 'INVENTORY_SNAPSHOT_STATUS_ACK',
              recovery_id: typeof msg?.recovery_id === 'string' ? msg.recovery_id : msg?.recoveryId,
              accepted: false,
              reason: recoveryInbound.reason,
            });
          }
          return;
        }
        try {
          const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
          if (type === 'INVENTORY_SNAPSHOT_CHUNK_ACK') {
            await GatewayRecoveryService.handleChunkAck(authed.facilityId, msg);
          } else {
            const result = await GatewayRecoveryService.handleSnapshotStatus(authed.facilityId, msg);
            const ackRecoveryId = result.recovery_id
              ?? (typeof msg?.recovery_id === 'string' ? msg.recovery_id : (typeof msg?.recoveryId === 'string' ? msg.recoveryId : undefined));
            safeSend(ws, {
              type: 'INVENTORY_SNAPSHOT_STATUS_ACK',
              recovery_id: ackRecoveryId,
              accepted: result.accepted,
              recovery_status: result.recovery_status,
              reason: result.reason,
            });
          }
        } catch (err) {
          logger.warn(`Gateway WS inventory snapshot message handling error type=${type} facility=${authed.facilityId}`, err);
        }
        return;
      }

      if (type === 'ACCESS_CODE_UPDATE_ACK') {
        try {
          const { AccessCodeService } = await import('@/services/access-code.service');
          AccessCodeService.getInstance().handleGatewayAccessCodeUpdateAck(authed.facilityId, msg);
        } catch (err) {
          logger.warn(`Gateway WS ACCESS_CODE_UPDATE_ACK handling error facility=${authed.facilityId}`, err);
        }
        return;
      }

      if (type === 'DEVICE_DELETED_ACK') {
        try {
          const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
          DeviceDeletionOutboxService.getInstance().handleDeviceDeletedAck(authed.facilityId, msg);
        } catch (err) {
          logger.warn(`Gateway WS DEVICE_DELETED_ACK handling error facility=${authed.facilityId}`, err);
        }
        return;
      }

      // Unknown message
      logger.warn(`Gateway WS unknown message type=${typeField} facility=${authed?.facilityId || 'n/a'}`);
      safeSend(ws, { type: 'ERROR', code: 'UNKNOWN_TYPE', message: `Unknown type ${typeField}` });
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

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      this.sweepHeartbeatClients(this.facilityToClient, (facilityId) => {
        this.facilityToClient.delete(facilityId);
      }, now);
      this.sweepHeartbeatClients(this.swapCandidates, (key) => {
        this.swapCandidates.delete(key);
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
          this.notifyConnectionChange(
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
          this.notifyConnectionChange(
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

  /**
   * Shutdown the transport and cleanup resources.
   * Stops heartbeat timer and closes all connections.
   */
  public shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    // Close all WebSocket connections
    for (const client of this.facilityToClient.values()) {
      try {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close();
        }
      } catch {}
    }
    this.facilityToClient.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }
  }

  private async proxyHttp(authed: AuthedClient, req: { method: string; path: string; headers?: Record<string, string>; query?: any; body?: any }) {
    const apiProxy = ApiProxyService.getInstance();
    return apiProxy.proxyRequest({
      user: { userId: authed.user.userId, role: authed.user.role, facilityIds: authed.user.facilityIds, email: authed.user.email },
      connectionFacilityId: authed.facilityId,
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
  }
}

function safeSend(ws: WebSocket, obj: any): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch {}
}

/**
 * Best-effort extraction of the remote peer address from a WebSocket.
 * Prefer the captured __remote address from the HTTP upgrade, with a
 * safe fallback to the underlying socket's remoteAddress if exposed.
 */
function getRemoteAddress(ws: RemoteWebSocket): string {
  if (ws.__remote) {
    return ws.__remote;
  }
  const anyWs = ws as unknown as { socket?: { remoteAddress?: string }; _socket?: { remoteAddress?: string } };
  const candidate = anyWs.socket?.remoteAddress ?? anyWs._socket?.remoteAddress;
  return typeof candidate === 'string' ? candidate : 'unknown';
}

