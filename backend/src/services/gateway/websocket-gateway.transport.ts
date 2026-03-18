import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { GatewayTransport } from './gateway-transport.interface';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { ApiProxyService } from './api-proxy.service';
import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

type JWTPayload = {
  userId: string;
  role: UserRole;
  facilityIds?: string[];
  email?: string;
};

type RemoteWebSocket = WebSocket & { __remote?: string };

type AuthedClient = {
  ws: RemoteWebSocket;
  user: JWTPayload;
  facilityId: string;
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
  private readonly path = '/ws/gateway';
  // Heartbeat configuration:
  // - pingIntervalMs: how long of inactivity before we proactively send a PING
  // - inactivityTimeoutMs: maximum allowed silence (no messages or PONG) before we close
  private readonly pingIntervalMs = (Number(process.env.GATEWAY_PING_INTERVAL_SEC) || 10) * 1000;
  private readonly inactivityTimeoutMs = (Number(process.env.GATEWAY_PONG_TIMEOUT_SEC) || 20) * 1000;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private connectionChangeListener?: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
  }) => void;

  public initialize(server: HTTPServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true, path: this.path, maxPayload: Number(process.env.GATEWAY_MAX_MESSAGE_BYTES) || 512 * 1024 });

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
    const client = this.facilityToClient.get(facilityId);
    if (!client) {
      logger.warn(`No connected gateway for facility ${facilityId} - command dropped`);
      return;
    }
    if (client.ws.readyState === WebSocket.OPEN) {
      // Handle JWT string payloads by wrapping in COMMAND envelope
      let message: string;
      let msgType = 'unknown';
      
      if (typeof payload === 'string' && payload.includes('.')) {
        // JWT string - wrap in envelope for gateway parsing
        message = JSON.stringify({ type: 'COMMAND', jwt: payload });
        // Try to extract cmd_type from JWT for logging
        try {
          const parts = payload.split('.');
          if (parts.length === 3) {
            const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            msgType = decoded?.cmd_type || 'JWT_COMMAND';
          }
        } catch { msgType = 'JWT_COMMAND'; }
      } else {
        // Legacy object/array payloads - send directly
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
    } else {
      logger.warn(`Gateway socket not open for facility ${facilityId}`);
    }
  }

  public setConnectionChangeListener(listener: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
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
  ): void {
    if (!this.connectionChangeListener) return;
    try {
      this.connectionChangeListener({
        facilityId,
        connected,
        reason,
        lastActivityAt,
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

    const closeAndCleanup = (reason = 'socket_closed') => {
      if (authed) {
        const current = this.facilityToClient.get(authed.facilityId);
        if (current?.ws === ws) {
          this.facilityToClient.delete(authed.facilityId);
          this.notifyConnectionChange(authed.facilityId, false, reason, authed.lastActivityAt);
          logger.info(`Gateway disconnected for facility ${authed.facilityId} (user=${authed.user.userId})`);
          GatewayDebugService.getInstance().publish({
            kind: 'connection_closed',
            facilityId: authed.facilityId,
            userId: authed.user.userId,
            ts: Date.now(),
            lastActivityAt: authed.lastActivityAt,
          });
          // Cancel any active firmware pushes for this facility to avoid long ACK timeout waits
          import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
            void FirmwareService.handleFacilityDisconnect(authed!.facilityId);
          }).catch(() => {});
        }
      }
      try { ws.close(); } catch {}
    };

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
        // Facility admin must be scoped to this facility
        if (decoded.role === UserRole.FACILITY_ADMIN) {
          const scopes = decoded.facilityIds || [];
          if (!scopes.includes(facilityId)) {
            logger.warn(`Gateway WS AUTH forbidden (facility not permitted) user=${decoded.userId} role=${decoded.role} remote=${remote} facility=${facilityId}`);
            safeSend(ws, { type: 'ERROR', code: 'AUTH_FORBIDDEN', message: 'Facility not permitted' });
            return closeAndCleanup();
          }
        }
        // Enforce one connection per facility: replace existing
        const existing = this.facilityToClient.get(facilityId);
        if (existing && existing.ws !== ws) {
          try { existing.ws.close(4000, 'replaced'); } catch {}
        }
        const now = Date.now();
        authed = { ws, user: decoded, facilityId, lastActivityAt: now };
        this.facilityToClient.set(facilityId, authed);
        this.notifyConnectionChange(facilityId, true, 'auth_ok', now);
        let ops_public_key_pem: string | undefined;
        try { ops_public_key_pem = await Ed25519Service.getOpsPublicKeyPem(); } catch {}
        safeSend(ws, {
          type: 'AUTH_OK',
          facilityId,
          ops_public_key: Ed25519Service.getOpsPublicKeyB64(),
          ops_public_key_jwk: Ed25519Service.getOpsPublicKeyJwk(),
          ops_public_key_pem,
        });
        logger.info(`Gateway WS authenticated: facility=${facilityId} user=${decoded.userId} role=${decoded.role} remote=${remote}`);
        GatewayDebugService.getInstance().publish({
          kind: 'connection_opened',
          facilityId,
          userId: decoded.userId,
          ts: now,
          lastActivityAt: now,
          remote,
        });
        // On reconnect, resume any interrupted OTA transfers for this facility.
        import('@/services/firmware/firmware.service').then(({ FirmwareService }) => {
          FirmwareService.resumePendingForFacility(facilityId).catch((err) => {
            logger.warn(`Failed to resume firmware pushes for facility=${facilityId}`, err);
          });
        }).catch(() => {});
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
        try {
          const { FirmwareService } = await import('@/services/firmware/firmware.service');
          if (type === 'FIRMWARE_CHUNK_ACK') {
            await FirmwareService.handleChunkAck(authed.facilityId, msg);
          } else if (type === 'FIRMWARE_UPDATE_STATUS') {
            await FirmwareService.handleUpdateStatus(authed.facilityId, msg);
          } else {
            await FirmwareService.handleProgress(authed.facilityId, msg);
          }
        } catch (err) {
          logger.warn(`Gateway WS firmware message handling error type=${type} facility=${authed.facilityId}`, err);
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
      closeAndCleanup('close_event');
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
      for (const [facilityId, client] of this.facilityToClient.entries()) {
        if (client.ws.readyState !== WebSocket.OPEN) {
          this.facilityToClient.delete(facilityId);
          continue;
        }
        const inactiveMs = now - client.lastActivityAt;
        if (inactiveMs > this.inactivityTimeoutMs) {
          logger.warn(`Gateway heartbeat inactivity timeout, closing facility ${facilityId}`);
          try { client.ws.close(4001, 'heartbeat timeout'); } catch {}
          this.facilityToClient.delete(facilityId);
          this.notifyConnectionChange(facilityId, false, 'heartbeat_timeout', client.lastActivityAt);
          GatewayDebugService.getInstance().publish({
            kind: 'heartbeat_timeout',
            facilityId,
            ts: now,
            lastActivityAt: client.lastActivityAt,
          });
          continue;
        }
        // Only send PING after a period of inactivity; any gateway message counts as activity.
        if (inactiveMs >= this.pingIntervalMs) {
          safeSend(client.ws, { type: 'PING' });
          GatewayDebugService.getInstance().publish({
            kind: 'ping_sent',
            facilityId,
            ts: now,
            lastActivityAt: client.lastActivityAt,
          });
        }
      }
    }, this.pingIntervalMs);
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

