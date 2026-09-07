import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { verify } from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { FacilityAccessService } from '@/services/facility-access.service';
import { AppRealtimeHub } from '@/services/app-realtime.hub';
import type { AppRealtimeClient, AppWsControlMessage } from '@/services/app-realtime.types';

function readPositiveMs(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * App-centric WebSocket transport on `/ws/app`.
 * Single facility-scoped multiplexed stream with heartbeat idle tear-down.
 */
export class AppWebSocketService {
  private static instance: AppWebSocketService;
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, AppRealtimeClient>();
  private pendingMessages = new Map<WebSocket, Buffer[]>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private idleSweepInterval: NodeJS.Timeout | null = null;
  private readonly path = '/ws/app';
  private readonly hub = AppRealtimeHub.getInstance();
  private readonly serverHeartbeatMs = readPositiveMs('APP_WS_HEARTBEAT_MS', 30_000);
  private readonly idleTimeoutMs = readPositiveMs('APP_WS_IDLE_MS', 60_000);

  public static getInstance(): AppWebSocketService {
    if (!AppWebSocketService.instance) {
      AppWebSocketService.instance = new AppWebSocketService();
    }
    return AppWebSocketService.instance;
  }

  public initialize(server: { on: (event: string, cb: (...args: any[]) => void) => void }): void {
    if (this.wss) return;

    this.hub.ensureListeners();
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

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void this.handleConnection(ws, req);
    });

    this.startHeartbeat();
    this.startIdleSweep();
    logger.info(`🔌 App WebSocket server initialized on path ${this.path}`);
  }

  public destroy(): void {
    this.stopHeartbeat();
    this.stopIdleSweep();
    for (const ws of this.clients.keys()) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.pendingMessages.clear();
    this.hub.destroy();
    AppWebSocketService.instance = undefined as unknown as AppWebSocketService;
    logger.info('🔌 App WebSocket service destroyed');
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    ws.on('message', (data: Buffer) => {
      if (!this.clients.has(ws)) {
        const queued = this.pendingMessages.get(ws) || [];
        if (queued.length < 20) {
          queued.push(data);
          this.pendingMessages.set(ws, queued);
        }
        return;
      }
      void this.handleMessage(ws, data);
    });

    ws.on('close', () => this.handleDisconnection(ws));
    ws.on('error', (error: Error) => {
      logger.error('App WebSocket error:', error);
      this.handleDisconnection(ws);
    });

    try {
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'No authentication token provided');
        return;
      }

      const decoded = verify(token, config.jwt.secret) as { userId: string; role: UserRole };
      const role = decoded.role;
      let facilityIds: string[] | undefined;
      if (role !== UserRole.ADMIN && role !== UserRole.DEV_ADMIN) {
        const liveIds = await FacilityAccessService.getUserFacilityIds(decoded.userId, role);
        facilityIds = liveIds.length > 0 ? liveIds : undefined;
      }

      const client: AppRealtimeClient = {
        userId: decoded.userId,
        userRole: role,
        facilityIds,
        lastClientHeartbeat: new Date(),
        heartbeatCount: 0,
      };

      this.clients.set(ws, client);
      logger.info(`🔌 App WS client connected: ${client.userId} (${client.userRole})`);

      const queued = this.pendingMessages.get(ws) || [];
      this.pendingMessages.delete(ws);
      for (const msg of queued) {
        await this.handleMessage(ws, msg);
      }
    } catch (error) {
      logger.error('App WebSocket connection error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  private async handleMessage(ws: WebSocket, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as AppWsControlMessage & {
        data?: { facility_id?: string; facilityId?: string };
      };
      const client = this.clients.get(ws);
      if (!client) {
        ws.close(1008, 'Client not found');
        return;
      }

      switch (message.type) {
        case 'subscription':
          await this.handleSubscription(ws, message, client);
          break;
        case 'unsubscription':
          this.handleUnsubscription(ws, message, client);
          break;
        case 'heartbeat':
          client.lastClientHeartbeat = new Date();
          client.heartbeatCount += 1;
          this.send(ws, {
            type: 'heartbeat',
            data: { message: 'Heartbeat received' },
            timestamp: new Date().toISOString(),
          });
          break;
        default:
          this.sendError(ws, `Unknown message type: ${(message as { type?: string }).type}`);
      }
    } catch (error) {
      logger.error('Error handling App WebSocket message:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  private async handleSubscription(
    ws: WebSocket,
    message: AppWsControlMessage & { data?: { facility_id?: string; facilityId?: string }; subscriptionType?: string },
    client: AppRealtimeClient,
  ): Promise<void> {
    if (message.subscriptionType && message.subscriptionType !== 'app') {
      this.sendError(ws, 'Only subscriptionType "app" is supported on /ws/app');
      return;
    }

    const facilityId = message.data?.facility_id || message.data?.facilityId;
    if (!facilityId) {
      this.sendError(ws, 'facility_id is required');
      return;
    }

    if (client.subscriptionId) {
      this.sendError(ws, 'An app subscription is already active; unsubscribe first to change facility');
      return;
    }

    // Refresh live facility scope for non-admins
    if (client.userRole !== UserRole.ADMIN && client.userRole !== UserRole.DEV_ADMIN) {
      const liveIds = await FacilityAccessService.getUserFacilityIds(client.userId, client.userRole);
      client.facilityIds = liveIds.length > 0 ? liveIds : undefined;
    }

    const subscriptionId =
      message.subscriptionId || `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await this.hub.subscribe(ws, client, facilityId, subscriptionId);
    if (!result.ok) {
      this.sendError(ws, result.error);
      return;
    }

    this.send(ws, {
      type: 'subscription',
      subscriptionId,
      subscriptionType: 'app',
      data: {
        message: 'Subscription created successfully',
        facility_id: facilityId,
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(`📡 App subscription created: ${subscriptionId} facility=${facilityId} user=${client.userId}`);
  }

  private handleUnsubscription(
    ws: WebSocket,
    message: AppWsControlMessage,
    client: AppRealtimeClient,
  ): void {
    if (!client.subscriptionId) {
      this.sendError(ws, 'No active app subscription');
      return;
    }
    const subscriptionId = client.subscriptionId;
    this.hub.unsubscribe(ws, client);
    this.send(ws, {
      type: 'unsubscription',
      subscriptionId,
      subscriptionType: 'app',
      data: { message: 'Unsubscription successful' },
      timestamp: new Date().toISOString(),
    });
  }

  private handleDisconnection(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      this.hub.removeSubscriber(ws);
      this.clients.delete(ws);
      logger.info(`🔌 App WS client disconnected: ${client.userId}`);
    }
    this.pendingMessages.delete(ws);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients.keys()) {
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, {
            type: 'heartbeat',
            data: { message: 'Server heartbeat' },
            timestamp: new Date().toISOString(),
          });
        }
      }
    }, this.serverHeartbeatMs);
    this.heartbeatInterval.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startIdleSweep(): void {
    this.idleSweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, client] of this.clients.entries()) {
        const idleMs = now - client.lastClientHeartbeat.getTime();
        if (idleMs >= this.idleTimeoutMs && ws.readyState === WebSocket.OPEN) {
          logger.info(
            `🔌 App WS idle timeout for user ${client.userId} (idle=${idleMs}ms, limit=${this.idleTimeoutMs}ms)`,
          );
          try {
            ws.close(1001, 'Idle timeout');
          } catch {
            /* ignore */
          }
        }
      }
    }, Math.min(10_000, Math.max(100, Math.floor(this.idleTimeoutMs / 4))));
    this.idleSweepInterval.unref();
  }

  private stopIdleSweep(): void {
    if (this.idleSweepInterval) {
      clearInterval(this.idleSweepInterval);
      this.idleSweepInterval = null;
    }
  }

  private send(ws: WebSocket, message: AppWsControlMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
