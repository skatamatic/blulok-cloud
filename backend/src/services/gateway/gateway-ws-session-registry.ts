import WebSocket from 'ws';
import { logger } from '@/utils/logger';
import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';
import { validateRecoveryInboundSession } from '@/utils/gateway-recovery-inbound.utils';
import { isRecoveryOutboundMessage } from '@/utils/gateway-recovery-outbound.utils';
import type { GatewaySessionRole } from './message-types';
import { UserRole } from '@/types/auth.types';

export type JWTPayload = {
  userId: string;
  role: UserRole;
  facilityIds?: string[];
  email?: string;
};

export type RemoteWebSocket = WebSocket & { __remote?: string };

export type AuthedClient = {
  ws: RemoteWebSocket;
  user: JWTPayload;
  facilityId: string;
  gatewayId?: string;
  sessionRole: GatewaySessionRole;
  lastActivityAt: number;
  authViaZtp?: boolean;
};

export type ConnectionChangeEvent = {
  facilityId: string;
  connected: boolean;
  timestamp: number;
  reason?: string;
  lastActivityAt?: number;
  userId?: string;
  remoteAddress?: string;
};

export type ConnectionChangeListener = (event: ConnectionChangeEvent) => void;

/**
 * Best-effort extraction of the remote peer address from a WebSocket.
 */
export function getRemoteAddress(ws: RemoteWebSocket): string {
  if (ws.__remote) {
    return ws.__remote;
  }
  const anyWs = ws as unknown as { socket?: { remoteAddress?: string }; _socket?: { remoteAddress?: string } };
  const candidate = anyWs.socket?.remoteAddress ?? anyWs._socket?.remoteAddress;
  return typeof candidate === 'string' ? candidate : 'unknown';
}

/**
 * Safe WebSocket send that swallows errors on closed sockets.
 */
export function safeSend(ws: WebSocket, obj: any): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch {}
}

/**
 * GatewayWsSessionRegistry
 *
 * Manages active and swap-candidate WebSocket sessions, recovery push targets,
 * and connection status queries. The transport owns an instance of this class.
 */
export class GatewayWsSessionRegistry {
  private facilityToClient = new Map<string, AuthedClient>();
  private swapCandidates = new Map<string, AuthedClient>();
  private recoveryPushGatewayByFacility = new Map<string, string>();
  private connectionChangeListener?: ConnectionChangeListener;

  /** Recent AUTH replace timestamps for flap detection (gatewayId → times). */
  private authReplaceTimes = new Map<string, number[]>();

  // ─────────────────────────────────────────────────────────────────────────
  // Public accessors for the transport to wire up
  // ─────────────────────────────────────────────────────────────────────────

  getFacilityToClientMap(): Map<string, AuthedClient> {
    return this.facilityToClient;
  }

  getSwapCandidatesMap(): Map<string, AuthedClient> {
    return this.swapCandidates;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection change listener
  // ─────────────────────────────────────────────────────────────────────────

  setConnectionChangeListener(listener: ConnectionChangeListener): () => void {
    this.connectionChangeListener = listener;
    return () => {
      if (this.connectionChangeListener === listener) {
        this.connectionChangeListener = undefined;
      }
    };
  }

  notifyConnectionChange(
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

  // ─────────────────────────────────────────────────────────────────────────
  // Gateway ID comparison
  // ─────────────────────────────────────────────────────────────────────────

  gatewayIdsEqual(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Session queries
  // ─────────────────────────────────────────────────────────────────────────

  getConnectedFacilityIds(): string[] {
    return Array.from(this.facilityToClient.keys());
  }

  getActiveConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
    const active = this.facilityToClient.get(facilityId);
    if (active && active.ws.readyState === WebSocket.OPEN) {
      return { connected: true, lastPongAt: active.lastActivityAt };
    }
    return { connected: false };
  }

  getConnectionStatusForFacility(facilityId: string): { connected: boolean; lastPongAt?: number } {
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

  getSwapCandidatesForFacility(facilityId: string): Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> {
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

  getFacilityGatewaySessions(facilityId: string): Array<{
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

  isGatewayWsConnected(facilityId: string, gatewayId: string): boolean {
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

  enrichSessionsForCompletedRecovery(
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

  // ─────────────────────────────────────────────────────────────────────────
  // Swap candidate counting
  // ─────────────────────────────────────────────────────────────────────────

  countSwapCandidatesForFacility(facilityId: string, excludeGatewayId?: string): number {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Recovery push targets
  // ─────────────────────────────────────────────────────────────────────────

  getRecoveryPushGatewayId(facilityId: string): string | undefined {
    return this.recoveryPushGatewayByFacility.get(facilityId);
  }

  isRecoveryPushTargetOnline(facilityId: string): boolean {
    const gatewayId = this.recoveryPushGatewayByFacility.get(facilityId);
    if (!gatewayId) return false;
    const client = this.swapCandidates.get(`${facilityId}:${gatewayId}`);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  setRecoveryPushTarget(facilityId: string, gatewayId: string | null): void {
    if (gatewayId) {
      this.recoveryPushGatewayByFacility.set(facilityId, gatewayId);
    } else {
      this.recoveryPushGatewayByFacility.delete(facilityId);
    }
  }

  validateRecoveryInboundSession(
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

  // ─────────────────────────────────────────────────────────────────────────
  // Session registration and management
  // ─────────────────────────────────────────────────────────────────────────

  setActiveClient(facilityId: string, client: AuthedClient): void {
    this.facilityToClient.set(facilityId, client);
  }

  getActiveClient(facilityId: string): AuthedClient | undefined {
    return this.facilityToClient.get(facilityId);
  }

  deleteActiveClient(facilityId: string): void {
    this.facilityToClient.delete(facilityId);
  }

  setSwapCandidate(key: string, client: AuthedClient): void {
    this.swapCandidates.set(key, client);
  }

  getSwapCandidate(key: string): AuthedClient | undefined {
    return this.swapCandidates.get(key);
  }

  deleteSwapCandidate(key: string): void {
    this.swapCandidates.delete(key);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Force disconnect
  // ─────────────────────────────────────────────────────────────────────────

  forceDisconnectFacility(facilityId: string, reason = 'force_disconnect'): void {
    const client = this.facilityToClient.get(facilityId);
    if (!client) return;
    try {
      client.ws.close(4000, reason.slice(0, 120));
    } catch {}
    this.facilityToClient.delete(facilityId);
  }

  forceDisconnectGatewayById(gatewayId: string, reason = 'force_disconnect'): void {
    const closeReason = reason.slice(0, 120);
    for (const [facilityId, client] of this.facilityToClient.entries()) {
      if (!client.gatewayId || !this.gatewayIdsEqual(client.gatewayId, gatewayId)) continue;
      try {
        client.ws.close(4000, closeReason);
      } catch {}
      this.facilityToClient.delete(facilityId);
    }
    for (const [key, client] of this.swapCandidates.entries()) {
      const candidateId = client.gatewayId || key.split(':').slice(1).join(':');
      if (!this.gatewayIdsEqual(candidateId, gatewayId)) continue;
      try {
        client.ws.close(4000, closeReason);
      } catch {}
      this.swapCandidates.delete(key);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Close active session helpers
  // ─────────────────────────────────────────────────────────────────────────

  closeActiveSessionForFacility(
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

  // ─────────────────────────────────────────────────────────────────────────
  // Promote / finalize recovery sessions
  // ─────────────────────────────────────────────────────────────────────────

  promoteSwapCandidateToActive(
    facilityId: string,
    gatewayId: string,
    sendAuthOk: (client: AuthedClient) => void,
  ): void {
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
    sendAuthOk(candidate);
  }

  finalizeRecoverySession(
    facilityId: string,
    newGatewayId: string,
    previousGatewayId: string | null,
    sendAuthOk: (client: AuthedClient) => void,
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
      sendAuthOk(candidate);
    }

    this.recoveryPushGatewayByFacility.delete(facilityId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auth replace tracking for flap detection
  // ─────────────────────────────────────────────────────────────────────────

  noteAuthReplace(gatewayId: string): void {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Unicast routing with recovery push target support
  // ─────────────────────────────────────────────────────────────────────────

  getUnicastTarget(facilityId: string, payload: any): { client: AuthedClient | undefined; isRecoveryPush: boolean } {
    const recoveryGatewayId = this.recoveryPushGatewayByFacility.get(facilityId);
    if (recoveryGatewayId && isRecoveryOutboundMessage(payload)) {
      const swapClient = this.swapCandidates.get(`${facilityId}:${recoveryGatewayId}`);
      if (swapClient) {
        return { client: swapClient, isRecoveryPush: true };
      }
      logger.warn(
        `Recovery push target offline for facility ${facilityId} gateway ${recoveryGatewayId} — dropping ${payload?.type ?? payload?.cmd_type ?? 'message'}`,
      );
      return { client: undefined, isRecoveryPush: true };
    }
    const client = this.facilityToClient.get(facilityId);
    return { client, isRecoveryPush: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shutdown / clear
  // ─────────────────────────────────────────────────────────────────────────

  clear(): void {
    const terminateClient = (client: AuthedClient) => {
      try {
        if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
          client.ws.terminate();
        }
      } catch {}
    };
    for (const client of this.facilityToClient.values()) {
      terminateClient(client);
    }
    this.facilityToClient.clear();
    for (const client of this.swapCandidates.values()) {
      terminateClient(client);
    }
    this.swapCandidates.clear();
    this.recoveryPushGatewayByFacility.clear();
  }
}
