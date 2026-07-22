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
import { config } from '@/config/environment';
import {
  ZTP_GW_AUTH_PREFIX,
  buildZtpSignPayload,
  verifyZtpSignature,
} from '@/services/gateway/ztp/gateway-ztp-crypto.utils';

type AuthedClient = {
  ws: RemoteWebSocket;
  user: JWTPayload;
  facilityId: string;
  gatewayId?: string;
  sessionRole: GatewaySessionRole;
  /** Timestamp of last observed activity (any valid message or PONG) */
  lastActivityAt: number;
  /** True when authenticated via ZTP ECDSA (no human JWT). */
  authViaZtp?: boolean;
};

type EcdsaChallengePending = {
  gatewayId: string;
  facilityId: string;
  publicKey: string;
  nonce: string;
  expiresAt: number;
  firmware_version?: string;
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
  private readonly ecdsaChallenges = new WeakMap<RemoteWebSocket, EcdsaChallengePending>();

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
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const gatewayId = client.gatewayId || key.split(':').slice(1).join(':');
      results.push({
        gatewayId,
        connected: true,
        lastActivityAt: client.lastActivityAt,
      });
    }
    return results;
  }

  /** Active production + parked swap-candidate WS sessions for a facility. */
  public getFacilityGatewaySessions(facilityId: string): Array<{
    gatewayId: string;
    sessionRole: 'active' | 'swap_candidate';
    connected: boolean;
    lastActivityAt?: number;
  }> {
    const results: Array<{
      gatewayId: string;
      sessionRole: 'active' | 'swap_candidate';
      connected: boolean;
      lastActivityAt?: number;
    }> = [];
    const active = this.facilityToClient.get(facilityId);
    if (active?.gatewayId) {
      results.push({
        gatewayId: active.gatewayId,
        sessionRole: active.sessionRole === 'swap_candidate' ? 'swap_candidate' : 'active',
        connected: active.ws.readyState === WebSocket.OPEN,
        lastActivityAt: active.lastActivityAt,
      });
    }
    for (const [key, client] of this.swapCandidates.entries()) {
      if (!key.startsWith(`${facilityId}:`)) continue;
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const gatewayId = client.gatewayId || key.split(':').slice(1).join(':');
      if (results.some((entry) => this.gatewayIdsEqual(entry.gatewayId, gatewayId))) continue;
      results.push({
        gatewayId,
        sessionRole: 'swap_candidate',
        connected: true,
        lastActivityAt: client.lastActivityAt,
      });
    }
    return results;
  }

  /** Whether a specific gateway has an open WS session for this facility (active or swap candidate). */
  public isGatewayWsConnected(facilityId: string, gatewayId: string): boolean {
    const active = this.facilityToClient.get(facilityId);
    if (
      active?.gatewayId
      && this.gatewayIdsEqual(active.gatewayId, gatewayId)
      && active.ws.readyState === WebSocket.OPEN
    ) {
      return true;
    }
    for (const [key, client] of this.swapCandidates.entries()) {
      if (!key.startsWith(`${facilityId}:`)) continue;
      const candidateId = client.gatewayId || key.split(':').slice(1).join(':');
      if (this.gatewayIdsEqual(candidateId, gatewayId) && client.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ensures completed-swap production appears as active, and the previous gateway
   * appears as a swap_candidate **only while it has a live non-production WS**.
   * Offline demoted units must not pollute the candidate pool.
   */
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
    const enriched = sessions.map((session) => ({ ...session }));
    const upsert = (
      gatewayId: string | null | undefined,
      sessionRole: 'active' | 'swap_candidate',
      options?: { requireConnected?: boolean },
    ) => {
      if (!gatewayId) return;
      const connected = this.isGatewayWsConnected(facilityId, gatewayId);
      if (options?.requireConnected && !connected) {
        // Drop any stale offline synthetic/previous entry for this gateway
        const index = enriched.findIndex((entry) => this.gatewayIdsEqual(entry.gatewayId, gatewayId));
        if (index >= 0 && enriched[index].sessionRole === 'swap_candidate' && !enriched[index].connected) {
          enriched.splice(index, 1);
        }
        return;
      }
      const index = enriched.findIndex((entry) => this.gatewayIdsEqual(entry.gatewayId, gatewayId));
      if (index >= 0) {
        enriched[index] = { ...enriched[index], sessionRole, connected };
      } else {
        enriched.push({ gatewayId, sessionRole, connected });
      }
    };
    upsert(productionGatewayId, 'active');
    upsert(previousGatewayId, 'swap_candidate', { requireConnected: true });
    return enriched;
  }

  private gatewayIdsEqual(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
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
    this.sendSessionRoleAuthOk(candidate);
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
      this.sendSessionRoleAuthOk(candidate);
    }

    this.recoveryPushGatewayByFacility.delete(facilityId);
  }

  /** Notify an already-authenticated gateway that its session role changed (e.g. swap complete). */
  private sendSessionRoleAuthOk(client: AuthedClient): void {
    void (async () => {
      let ops_public_key_pem: string | undefined;
      try { ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem(); } catch { /* optional */ }
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
      || active.gatewayId === previousGatewayId;

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

  public forceDisconnectFacility(facilityId: string, reason = 'force_disconnect'): void {
    const client = this.facilityToClient.get(facilityId);
    if (!client) return;
    try {
      client.ws.close(4000, reason.slice(0, 120));
    } catch {
      /* ignore */
    }
    this.facilityToClient.delete(facilityId);
  }

  /**
   * Close any open WS session for this gateway id (active or parked swap candidate).
   * Used by ZTP release/revoke so unbound swap-prep sessions are not left hanging.
   */
  public forceDisconnectGatewayById(gatewayId: string, reason = 'force_disconnect'): void {
    const closeReason = reason.slice(0, 120);
    for (const [facilityId, client] of this.facilityToClient.entries()) {
      if (!client.gatewayId || !this.gatewayIdsEqual(client.gatewayId, gatewayId)) continue;
      try {
        client.ws.close(4000, closeReason);
      } catch {
        /* ignore */
      }
      this.facilityToClient.delete(facilityId);
    }
    for (const [key, client] of this.swapCandidates.entries()) {
      const candidateId = client.gatewayId || key.split(':').slice(1).join(':');
      if (!this.gatewayIdsEqual(candidateId, gatewayId)) continue;
      try {
        client.ws.close(4000, closeReason);
      } catch {
        /* ignore */
      }
      this.swapCandidates.delete(key);
    }
  }

  /** Recent AUTH replace timestamps for flap detection (gatewayId → times). */
  private authReplaceTimes = new Map<string, number[]>();

  private noteAuthReplace(gatewayId: string): void {
    const now = Date.now();
    const windowMs = 60_000;
    const times = (this.authReplaceTimes.get(gatewayId) || []).filter((t) => now - t < windowMs);
    times.push(now);
    this.authReplaceTimes.set(gatewayId, times);
    if (times.length >= 4) {
      logger.warn(
        `Gateway session flap detected gateway=${gatewayId} replaces=${times.length} in ${windowMs}ms`,
      );
    }
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
   * After AUTH_OK for the active (bound) gateway: full access-code + denylist snapshots
   * and pending device-deletion tombstones. Gateways may have empty local state after restart.
   */
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

      if (type === 'AUTH_HELLO') {
        const remote = getRemoteAddress(ws);
        const gatewayId = String(msg?.gatewayId || msg?.gateway_id || '');
        if (!gatewayId || !isValidGatewayUuid(gatewayId)) {
          safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId required (UUID)' });
          return closeAndCleanup();
        }
        const helloFacilityId =
          typeof msg?.facilityId === 'string' && msg.facilityId.trim()
            ? String(msg.facilityId).trim()
            : typeof msg?.facility_id === 'string' && msg.facility_id.trim()
              ? String(msg.facility_id).trim()
              : undefined;

        const { GatewayModel } = await import('@/models/gateway.model');
        const { getZtpIntendedFacilityId } = await import('@/utils/gateway-ztp-claim.utils');
        const gatewayModel = new GatewayModel();
        const gateway = await gatewayModel.findById(gatewayId);
        if (!gateway?.public_key) {
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway not claimed for ZTP auth' });
          return closeAndCleanup();
        }
        if (gateway.revoked_at) {
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway revoked' });
          return closeAndCleanup();
        }
        if (gateway.released_at) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'AUTH_FAILED',
            message: 'Gateway unbound — use provision flow',
          });
          return closeAndCleanup();
        }

        let facilityId: string;
        if (gateway.facility_id) {
          if (helloFacilityId && helloFacilityId !== gateway.facility_id) {
            safeSend(ws, {
              type: 'ERROR',
              code: 'AUTH_FORBIDDEN',
              message: 'facilityId does not match bound gateway',
            });
            return closeAndCleanup();
          }
          facilityId = gateway.facility_id;
        } else {
          const intended = getZtpIntendedFacilityId(gateway.metadata);
          if (!intended) {
            safeSend(ws, {
              type: 'ERROR',
              code: 'AUTH_FAILED',
              message: 'Gateway unbound — use provision flow',
            });
            return closeAndCleanup();
          }
          if (helloFacilityId && helloFacilityId !== intended) {
            safeSend(ws, {
              type: 'ERROR',
              code: 'AUTH_FORBIDDEN',
              message: 'facilityId does not match ZTP claim',
            });
            return closeAndCleanup();
          }
          facilityId = intended;
        }

        const { randomBytes } = await import('crypto');
        const nonce = randomBytes(32).toString('base64url');
        this.ecdsaChallenges.set(ws, {
          gatewayId,
          facilityId,
          publicKey: gateway.public_key,
          nonce,
          expiresAt: Date.now() + 60_000,
          firmware_version:
            typeof msg?.firmware_version === 'string' ? msg.firmware_version : undefined,
        });
        safeSend(ws, { type: 'AUTH_CHALLENGE', nonce, expires_in_seconds: 60 });
        logger.info(
          `Gateway WS AUTH_HELLO challenge issued gateway=${gatewayId} facility=${facilityId} remote=${remote}`,
        );
        return;
      }

      if (type === 'AUTH_PROOF') {
        const remote = getRemoteAddress(ws);
        const pending = this.ecdsaChallenges.get(ws);
        if (!pending || Date.now() > pending.expiresAt) {
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Challenge expired or missing' });
          return closeAndCleanup();
        }
        const signature = String(msg?.signature || msg?.proof || '');
        const payload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, pending.nonce, pending.gatewayId);
        if (!verifyZtpSignature(pending.publicKey, payload, signature)) {
          safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Invalid signature' });
          return closeAndCleanup();
        }
        this.ecdsaChallenges.delete(ws);

        // Re-validate live DB state (revoke/release/key change during challenge window)
        const { GatewayModel } = await import('@/models/gateway.model');
        const { getZtpIntendedFacilityId } = await import('@/utils/gateway-ztp-claim.utils');
        const gatewayModel = new GatewayModel();
        const liveGateway = await gatewayModel.findById(pending.gatewayId);
        if (!liveGateway?.public_key || liveGateway.revoked_at || liveGateway.public_key !== pending.publicKey) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'AUTH_FORBIDDEN',
            message: 'Gateway claim state changed — reconnect',
          });
          return closeAndCleanup();
        }
        if (liveGateway.released_at) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'AUTH_FAILED',
            message: 'Gateway unbound — use provision flow',
          });
          return closeAndCleanup();
        }

        const intended = getZtpIntendedFacilityId(liveGateway.metadata);
        const facilityId = liveGateway.facility_id || intended;
        if (!facilityId || facilityId !== pending.facilityId) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'AUTH_FORBIDDEN',
            message: 'Gateway claim state changed — reconnect',
          });
          return closeAndCleanup();
        }

        const gatewayId = pending.gatewayId;
        const syntheticUser: JWTPayload = {
          userId: `ztp:${gatewayId}`,
          role: UserRole.FACILITY_ADMIN,
          facilityIds: [facilityId],
        };

        const boundGateway = await gatewayModel.findByFacilityId(facilityId);
        let sessionRole: GatewaySessionRole = 'active';
        const now = Date.now();

        const finishZtpAuthOk = async (role: GatewaySessionRole) => {
          const { parseAuthFirmwareVersion, persistAuthFirmwareSeed } = await import(
            '@/utils/gateway-auth-firmware.utils'
          );
          const authFirmwareVersion = parseAuthFirmwareVersion(pending.firmware_version);
          if (authFirmwareVersion) {
            try {
              await persistAuthFirmwareSeed({
                facilityId,
                gatewayId,
                firmwareVersion: authFirmwareVersion,
              });
            } catch (err) {
              logger.warn(
                `Gateway WS ZTP AUTH firmware seed persist failed facility=${facilityId} gateway=${gatewayId}`,
                err,
              );
            }
          }

          if (role === 'active') {
            this.notifyConnectionChange(facilityId, true, 'ztp_auth', now, syntheticUser.userId, remote);
          }
          let ops_public_key_pem: string | undefined;
          try {
            ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem();
          } catch {
            /* optional */
          }
          safeSend(ws, {
            type: 'AUTH_OK',
            facilityId,
            gatewayId,
            sessionRole: role,
            ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
            ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
            ops_public_key_pem,
          });
          logger.info(
            `Gateway WS ZTP authenticated: facility=${facilityId} gateway=${gatewayId} role=${role} remote=${remote}`,
          );
          GatewayDebugService.getInstance().publish({
            kind: 'connection_opened',
            facilityId,
            userId: syntheticUser.userId,
            ts: now,
            lastActivityAt: now,
            remote,
          });

          if (role === 'active') {
            import('@/services/firmware/firmware.service')
              .then(({ FirmwareService }) => {
                FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
                  logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
                });
              })
              .catch(() => {});
            import('@/services/gateway/gateway-recovery.service')
              .then(({ GatewayRecoveryService }) => {
                GatewayRecoveryService.resumePendingForFacility(facilityId).catch((err) => {
                  logger.warn(`Failed to resume gateway recovery for facility=${facilityId}`, err);
                });
              })
              .catch(() => {});
            this.scheduleActiveSessionCommandFlush(facilityId);
          }
        };

        // This device is the bound production gateway → active
        if (boundGateway && boundGateway.id === gatewayId) {
          const existing = this.facilityToClient.get(facilityId);
          if (existing && existing.ws !== ws) {
            this.noteAuthReplace(gatewayId);
            try {
              existing.ws.close(4000, 'replaced');
            } catch {
              /* ignore */
            }
          }
          authed = {
            ws,
            user: syntheticUser,
            facilityId,
            gatewayId,
            sessionRole: 'active',
            lastActivityAt: now,
            authViaZtp: true,
          };
          this.facilityToClient.set(facilityId, authed);
          await finishZtpAuthOk('active');
          return;
        }

        // Facility already has a different bound gateway → park as swap candidate
        if (boundGateway && boundGateway.id !== gatewayId) {
          const limitReject = this.checkAutoRegisterLimits(facilityId, gatewayId, {
            enforceRateLimit: false,
          });
          if (limitReject) {
            logger.warn(
              `Gateway WS ZTP AUTH rejected (swap candidate) facility=${facilityId} gateway=${gatewayId} code=${limitReject.code}`,
            );
            safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
            return closeAndCleanup();
          }

          sessionRole = 'swap_candidate';
          const swapKey = `${facilityId}:${gatewayId}`;
          const existingCandidate = this.swapCandidates.get(swapKey);
          if (existingCandidate && existingCandidate.ws !== ws) {
            try {
              existingCandidate.ws.close(4000, 'replaced');
            } catch {
              /* ignore */
            }
          }
          authed = {
            ws,
            user: syntheticUser,
            facilityId,
            gatewayId,
            sessionRole,
            lastActivityAt: now,
            authViaZtp: true,
          };
          this.swapCandidates.set(swapKey, authed);
          try {
            const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
            await GatewayRecoveryService.detect(facilityId, gatewayId, boundGateway.id);
          } catch (err) {
            logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
          }
          logger.info(
            `Gateway WS ZTP swap candidate parked: facility=${facilityId} newGateway=${gatewayId} boundGateway=${boundGateway.id}`,
          );
          await finishZtpAuthOk('swap_candidate');
          return;
        }

        // No bound gateway — race after swap-prep claim, or greenfield unbound row: bind as first
        if (!liveGateway.facility_id) {
          let result: { bound: boolean; created: boolean };
          try {
            result = await gatewayModel.createOrBindAsFirstGateway({
              id: gatewayId,
              facilityId,
              metadata:
                typeof liveGateway.metadata === 'object' && liveGateway.metadata
                  ? liveGateway.metadata
                  : undefined,
            });
          } catch (err) {
            logger.error(
              `Gateway WS ZTP AUTH first-bind failed facility=${facilityId} gateway=${gatewayId}`,
              err,
            );
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway registration failed' });
            return closeAndCleanup();
          }
          if (result.bound) {
            const existing = this.facilityToClient.get(facilityId);
            if (existing && existing.ws !== ws) {
              this.noteAuthReplace(gatewayId);
              try {
                existing.ws.close(4000, 'replaced');
              } catch {
                /* ignore */
              }
            }
            authed = {
              ws,
              user: syntheticUser,
              facilityId,
              gatewayId,
              sessionRole: 'active',
              lastActivityAt: now,
              authViaZtp: true,
            };
            this.facilityToClient.set(facilityId, authed);
            await finishZtpAuthOk('active');
            return;
          }
          const winner = await gatewayModel.findByFacilityId(facilityId);
          if (!winner) {
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Facility gateway binding conflict' });
            return closeAndCleanup();
          }
          const limitReject = this.checkAutoRegisterLimits(facilityId, gatewayId, {
            enforceRateLimit: false,
          });
          if (limitReject) {
            safeSend(ws, { type: 'ERROR', code: limitReject.code, message: limitReject.message });
            return closeAndCleanup();
          }
          sessionRole = 'swap_candidate';
          const swapKey = `${facilityId}:${gatewayId}`;
          authed = {
            ws,
            user: syntheticUser,
            facilityId,
            gatewayId,
            sessionRole,
            lastActivityAt: now,
            authViaZtp: true,
          };
          this.swapCandidates.set(swapKey, authed);
          try {
            const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
            await GatewayRecoveryService.detect(facilityId, gatewayId, winner.id);
          } catch (err) {
            logger.warn(`Failed to detect gateway swap facility=${facilityId}`, err);
          }
          await finishZtpAuthOk('swap_candidate');
          return;
        }

        // Bound row but findByFacilityId missed (shouldn't happen) — treat as active
        const existing = this.facilityToClient.get(facilityId);
        if (existing && existing.ws !== ws) {
          this.noteAuthReplace(gatewayId);
          try {
            existing.ws.close(4000, 'replaced');
          } catch {
            /* ignore */
          }
        }
        authed = {
          ws,
          user: syntheticUser,
          facilityId,
          gatewayId,
          sessionRole: 'active',
          lastActivityAt: now,
          authViaZtp: true,
        };
        this.facilityToClient.set(facilityId, authed);
        await finishZtpAuthOk('active');
        return;
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

        if (!gatewayId) {
          logger.warn(`Gateway WS AUTH bad request (missing gatewayId) user=${decoded.userId} remote=${remote} facility=${facilityId}`);
          safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId required' });
          return closeAndCleanup();
        }
        if (!isValidGatewayUuid(gatewayId)) {
          logger.warn(`Gateway WS AUTH bad request (invalid gatewayId) user=${decoded.userId} remote=${remote} facility=${facilityId} gateway=${gatewayId}`);
          safeSend(ws, { type: 'ERROR', code: 'AUTH_BAD_REQUEST', message: 'gatewayId must be a valid UUID' });
          return closeAndCleanup();
        }

        const { GatewayModel } = await import('@/models/gateway.model');
        const gatewayModel = new GatewayModel();
        // ZTP-claimed devices must use ECDSA AUTH — do not accept human JWT as fallback
        {
          const ztpRow = await gatewayModel.findById(gatewayId);
          if (ztpRow?.public_key && !ztpRow.revoked_at) {
            logger.warn(
              `Gateway WS AUTH rejected (ZTP device requires ECDSA) gateway=${gatewayId} facility=${facilityId}`,
            );
            safeSend(ws, {
              type: 'ERROR',
              code: 'AUTH_FORBIDDEN',
              message: 'ZTP gateway must authenticate with AUTH_HELLO / AUTH_PROOF',
            });
            return closeAndCleanup();
          }
          if (ztpRow?.revoked_at) {
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Gateway revoked' });
            return closeAndCleanup();
          }
        }

        const boundGateway = await gatewayModel.findByFacilityId(facilityId);

        let sessionRole: GatewaySessionRole = 'active';
        let resolvedGatewayId = gatewayId;
        let autoRegistered = false;

        const setActiveSession = (gid: string, role: GatewaySessionRole) => {
          const existing = this.facilityToClient.get(facilityId);
          if (existing && existing.ws !== ws && (existing.gatewayId === gid || existing.sessionRole === 'active')) {
            this.noteAuthReplace(gid);
            try { existing.ws.close(4000, 'replaced'); } catch {}
          }
          const now = Date.now();
          authed = { ws, user: decoded, facilityId, gatewayId: gid, sessionRole: role, lastActivityAt: now };
          this.facilityToClient.set(facilityId, authed);
        };

        const parkSwapCandidate = async (gid: string, boundId: string): Promise<boolean> => {
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
          return true;
        };

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
              if (!(await parkSwapCandidate(gatewayId, boundGateway.id))) {
                return;
              }
            } else {
              // No bound gateway for this facility → first-install auto-bind.
              if (config.gatewayZtpRequired) {
                logger.warn(
                  `Gateway WS AUTH rejected (GATEWAY_ZTP_REQUIRED) first-install JWT bind facility=${facilityId} gateway=${gatewayId}`,
                );
                safeSend(ws, {
                  type: 'ERROR',
                  code: 'AUTH_FORBIDDEN',
                  message: 'ZTP claim required for new gateway bind',
                });
                return closeAndCleanup();
              }
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
                if (!(await parkSwapCandidate(gatewayId, winner.id))) {
                  return;
                }
              }
            }
          } catch (err) {
            logger.error(`Gateway WS AUTH auto-register failed facility=${facilityId} gateway=${gatewayId}`, err);
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Gateway registration failed' });
            return closeAndCleanup();
          }

        if (!authed) {
          return;
        }

        const { parseAuthFirmwareVersion, persistAuthFirmwareSeed } = await import(
          '@/utils/gateway-auth-firmware.utils'
        );
        const authFirmwareVersion = parseAuthFirmwareVersion(msg?.firmware_version);
        if (authFirmwareVersion) {
          try {
            await persistAuthFirmwareSeed({
              facilityId,
              gatewayId: resolvedGatewayId,
              firmwareVersion: authFirmwareVersion,
            });
          } catch (err) {
            logger.warn(
              `Gateway WS AUTH firmware seed persist failed facility=${facilityId} gateway=${resolvedGatewayId}`,
              err,
            );
          }
        }

        if (sessionRole === 'active') {
          this.notifyConnectionChange(facilityId, true, 'auth_ok', authed.lastActivityAt, decoded.userId, remote);
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
        logger.info(`Gateway WS authenticated: facility=${facilityId} gateway=${resolvedGatewayId} role=${sessionRole} user=${decoded.userId} remote=${remote}`);
        GatewayDebugService.getInstance().publish({
          kind: 'connection_opened',
          facilityId,
          userId: decoded.userId,
          ts: authed.lastActivityAt,
          lastActivityAt: authed.lastActivityAt,
          remote,
        });
        import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
          FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
          });
        }).catch(() => {});
        import('@/services/gateway/gateway-recovery.service').then(({ GatewayRecoveryService }) => {
          GatewayRecoveryService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume gateway recovery for facility=${facilityId}`, err);
          });
        }).catch(() => {});
        if (sessionRole === 'active') {
          this.scheduleActiveSessionCommandFlush(facilityId);
        }
        return;
      }

      if (!authed) {
        const remote = getRemoteAddress(ws);
        logger.warn(`Gateway WS message before AUTH (type=${typeField}) remote=${remote} - closing`);
        safeSend(ws, { type: 'ERROR', code: 'NOT_AUTHENTICATED', message: 'Send AUTH or AUTH_HELLO first' });
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
        if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
          client.ws.terminate();
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
      gatewayId: authed.gatewayId,
      sessionRole: authed.sessionRole,
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

