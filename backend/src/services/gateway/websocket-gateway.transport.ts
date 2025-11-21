import { Server as HTTPServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { GatewayTransport } from './gateway-transport.interface';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { ApiProxyService } from './api-proxy.service';

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
  private heartbeatTimer?: NodeJS.Timer;

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
      client.ws.send(JSON.stringify(payload));
    } else {
      logger.warn(`Gateway socket not open for facility ${facilityId}`);
    }
  }

  private bindConnection(ws: RemoteWebSocket): void {
    let authed: AuthedClient | null = null;

    const closeAndCleanup = () => {
      if (authed) {
        const current = this.facilityToClient.get(authed.facilityId);
        if (current?.ws === ws) {
          this.facilityToClient.delete(authed.facilityId);
          logger.info(`Gateway disconnected for facility ${authed.facilityId} (user=${authed.user.userId})`);
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

      // Any valid message from the gateway counts as activity/keep-alive
      if (authed) {
        authed.lastActivityAt = Date.now();
      }

      if (type === 'PONG') {
        const remote = getRemoteAddress(ws);
        if (authed) {
          logger.info('Gateway WS PONG received', {
            facilityId: authed.facilityId,
            userId: authed.user.userId,
            remote,
          });
          // Acknowledge so gateways can confirm their PONG was processed
          safeSend(ws, { type: 'PONG_OK', ts: Date.now() });
        } else {
          logger.info('Gateway WS PONG received before AUTH completed', { remote });
        }
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
        authed = { ws, user: decoded, facilityId, lastActivityAt: Date.now() };
        this.facilityToClient.set(facilityId, authed);
        safeSend(ws, { type: 'AUTH_OK', facilityId });
        logger.info(`Gateway WS authenticated: facility=${facilityId} user=${decoded.userId} role=${decoded.role} remote=${remote}`);
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
        try {
          const response = await this.proxyHttp(authed, { method, path, headers, query, body });
          safeSend(ws, { type: 'PROXY_RESPONSE', id, status: response.status, headers: response.headers, body: response.data });
        } catch (e: any) {
          const status = e?.response?.status || 500;
          const data = e?.response?.data || { error: 'Proxy failed' };
          logger.warn(`Gateway WS proxy error facility=${authed.facilityId} user=${authed.user.userId} method=${method} path=${path} status=${status}`);
          safeSend(ws, { type: 'PROXY_RESPONSE', id, status, body: data });
        }
        return;
      }

      // Unknown message
      logger.warn(`Gateway WS unknown message type=${typeField} facility=${authed?.facilityId || 'n/a'}`);
      safeSend(ws, { type: 'ERROR', code: 'UNKNOWN_TYPE', message: `Unknown type ${typeField}` });
    });

    ws.on('close', closeAndCleanup);
    ws.on('error', (err) => {
      logger.warn('Gateway WS error:', err);
      closeAndCleanup();
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
          continue;
        }
        // Only send PING after a period of inactivity; any gateway message counts as activity.
        if (inactiveMs >= this.pingIntervalMs) {
          safeSend(client.ws, { type: 'PING' });
        }
      }
    }, this.pingIntervalMs);
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

