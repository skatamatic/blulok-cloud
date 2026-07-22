import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { verify } from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { SubscriptionRegistry } from './subscriptions/subscription-registry';
import { GatewayTelemetryLogService } from './gateway-telemetry-log.service';
import { GatewayDeviceSyncLogService } from './gateway-device-sync-log.service';
import { FacilityAccessService } from '@/services/facility-access.service';

function readPositiveMs(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Normal browser close/refresh, idle sever, or going-away — not operational incidents. */
function isExpectedDashboardClose(code: number): boolean {
  return code === 1000 || code === 1001;
}

/**
 * WebSocket Subscription Interface
 *
 * Represents an active subscription to real-time data streams.
 * Subscriptions are created when clients request specific data feeds
 * and are automatically cleaned up on disconnection or timeout.
 */
export interface Subscription {
  /** Unique subscription identifier */
  id: string;
  /** Type of subscription (e.g., 'gateway_status', 'device_updates') */
  type: string;
  /** User who created this subscription */
  userId: string;
  /** User's role for access control */
  userRole: UserRole;
  /** When the subscription was created */
  createdAt: Date;
  /** Last heartbeat timestamp from client */
  lastHeartbeat: Date;
  /** Optional filters to limit subscription scope */
  filters?: Record<string, any>;
}

interface WebSocketClientContext {
  userId: string;
  userRole: UserRole;
  subscriptions: Map<string, Subscription>;
  pendingSubscriptionKeys: Set<string>;
  facilityIds?: string[];
  heartbeatCount: number;
  /** Last JSON heartbeat (or connect) from the browser client — used for idle sever. */
  lastClientHeartbeat: Date;
}

/**
 * WebSocket Message Interface
 *
 * Defines the protocol for client-server communication over WebSocket connections.
 * Messages are JSON-encoded and support various real-time operations.
 */
export interface WebSocketMessage {
  /** Message type determining how the message should be processed */
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update' | 'gateway_status_update' | 'scope_update';
  /** Subscription ID for targeted messages */
  subscriptionId?: string;
  /** Type of subscription being referenced */
  subscriptionType?: string;
  /** Message payload data */
  data?: any;
  /** Error message if type is 'error' */
  error?: string;
  /** ISO timestamp when message was sent */
  timestamp?: string;
}

/**
 * WebSocket Service
 *
 * Manages real-time bidirectional communication between clients and server.
 * Provides subscription-based data streaming, authentication, and connection management
 * through a sophisticated registry of specialized subscription managers.
 *
 * Key Features:
 * - JWT-based authentication for WebSocket connections
 * - Role-based access control with facility scoping
 * - Heartbeat monitoring for connection health
 * - Pluggable subscription manager architecture
 * - Automatic cleanup of stale connections and subscriptions
 *
 * Security Considerations:
 * - All connections require valid JWT authentication
 * - Role-based filtering prevents unauthorized data access
 * - Facility-scoped subscriptions for multi-tenant isolation
 * - Connection limits prevent DoS attacks
 * - Automatic cleanup prevents resource leaks
 * - Encrypted WebSocket connections (WSS) in production
 *
 * Subscription Manager Architecture:
 * - GeneralStatsSubscriptionManager: System-wide statistics and metrics
 * - GatewayStatusSubscriptionManager: Gateway connectivity and health
 * - FMSSyncSubscriptionManager: FMS synchronization status
 * - DashboardLayoutSubscriptionManager: User dashboard configuration
 * - LogsSubscriptionManager: Real-time log streaming
 * - UnitsSubscriptionManager: Unit status and occupancy updates
 * - BatterySubscriptionManager: Device battery level monitoring
 * - CommandQueueSubscriptionManager: Command execution queue status
 * - FMSSyncProgressSubscriptionManager: FMS sync operation progress
 *
 * Message Protocol:
 * - subscription: Create new data stream subscription
 * - unsubscription: Cancel existing subscription
 * - heartbeat: Connection health monitoring
 * - data: Initial subscription data payload
 * - error: Error reporting and handling
 * - [type]_update: Real-time data updates (e.g., gateway_status_update)
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WebSocketClientContext> = new Map();
  private pendingMessages: Map<WebSocket, Buffer[]> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private idleSweepInterval: NodeJS.Timeout | null = null;
  private subscriptionRegistry: SubscriptionRegistry;
  private readonly path = '/ws';
  /**
   * Liveness defaults (override via env):
   * - Heartbeat every 5s — frequent enough for interactive dashboard freshness
   * - Idle sever at 15s (3× heartbeat) — detects dead sockets quickly while
   *   tolerating one–two delayed client ticks (GC, brief tab pressure)
   */
  private readonly serverHeartbeatMs = readPositiveMs('DASHBOARD_WS_HEARTBEAT_MS', 5_000);
  private readonly idleTimeoutMs = readPositiveMs('DASHBOARD_WS_IDLE_MS', 15_000);

  private constructor() {
    this.subscriptionRegistry = new SubscriptionRegistry();
    GatewayTelemetryLogService.getInstance().setSubscriptionRegistry(this.subscriptionRegistry);
    GatewayDeviceSyncLogService.getInstance().setSubscriptionRegistry(this.subscriptionRegistry);
    this.startHeartbeat();
    this.startIdleSweep();
  }

  /**
   * Get singleton instance of the WebSocket service.
   * Ensures consistent WebSocket management across the application.
   */
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(server: any): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true, path: this.path });

    server.on('upgrade', (request: IncomingMessage, socket: import('net').Socket, head: Buffer) => {
      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        if (url.pathname !== this.path) return;
        this.wss!.handleUpgrade(request, socket as any, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } catch (e) {
        try { socket.destroy(); } catch {}
      }
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    logger.info(`🔌 WebSocket server initialized on path ${this.path}`);
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    ws.on('message', (data: Buffer) => {
      const hasClientContext = this.clients.has(ws);
      if (!hasClientContext) {
        const queued = this.pendingMessages.get(ws) || [];
        if (queued.length < 20) {
          queued.push(data);
          this.pendingMessages.set(ws, queued);
        }
        return;
      }
      this.handleMessage(ws, data);
    });

    ws.on('close', (code: number, reasonBuf: Buffer) => {
      const reason = reasonBuf?.toString?.() || '';
      this.handleDisconnection(ws, code, reason);
    });

    ws.on('error', (error: Error) => {
      logger.warn('Dashboard WS socket error', {
        message: error.message,
        userId: this.clients.get(ws)?.userId,
      });
      this.handleDisconnection(ws, 1011, error.message || 'socket error');
    });

    try {
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'No authentication token provided');
        return;
      }

      const decoded = verify(token, config.jwt.secret) as any;

      const role = decoded.role as UserRole;
      let facilityIds: string[] | undefined;
      if (role !== UserRole.ADMIN && role !== UserRole.DEV_ADMIN) {
        const liveIds = await FacilityAccessService.getUserFacilityIds(decoded.userId, role);
        facilityIds = liveIds.length > 0 ? liveIds : undefined;
        logger.info(`🔌 Loaded ${liveIds.length} facility IDs for user ${decoded.userId} (${role})`);
      }

      const client: WebSocketClientContext = {
        userId: decoded.userId,
        userRole: role,
        subscriptions: new Map<string, Subscription>(),
        pendingSubscriptionKeys: new Set<string>(),
        facilityIds,
        heartbeatCount: 0,
        lastClientHeartbeat: new Date(),
      };

      this.clients.set(ws, client);
      logger.info(`🔌 WebSocket client connected: ${client.userId} (${client.userRole})`);
      const queuedMessages = this.pendingMessages.get(ws) || [];
      this.pendingMessages.delete(ws);
      for (const pendingMessage of queuedMessages) {
        await this.handleMessage(ws, pendingMessage);
      }

    } catch (error) {
      logger.error('WebSocket connection error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  private async handleMessage(ws: WebSocket, data: Buffer): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
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
          this.handleHeartbeat(ws, message, client);
          break;
        case 'diagnostics':
          this.handleDiagnostics(ws, message, client);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  private async refreshClientFacilityScope(client: WebSocketClientContext): Promise<boolean> {
    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return false;
    }

    const liveIds = await FacilityAccessService.getUserFacilityIds(client.userId, client.userRole);
    const next = liveIds.length > 0 ? liveIds : undefined;
    const prevKey = JSON.stringify(client.facilityIds ?? []);
    const nextKey = JSON.stringify(next ?? []);
    client.facilityIds = next;
    return prevKey !== nextKey;
  }

  /** Re-load facility scope for every dashboard WS client belonging to a user. */
  public async refreshFacilityScopeForUser(userId: string, userRole: UserRole): Promise<void> {
    for (const [ws, client] of this.clients.entries()) {
      if (client.userId !== userId) continue;
      const changed = await this.refreshClientFacilityScope(client);
      if (changed && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, {
          type: 'scope_update',
          data: { facilityIds: client.facilityIds ?? [] },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: WebSocketClientContext): Promise<void> {
    if (!message.subscriptionType) {
      this.sendError(ws, 'Subscription type required');
      return;
    }

    await this.refreshClientFacilityScope(client);

    const subscriptionKey = this.makeSubscriptionKey(message.subscriptionType, message.data);
    const existing = Array.from(client.subscriptions.values()).find((sub: Subscription) =>
      this.makeSubscriptionKey(sub.type, sub.filters) === subscriptionKey,
    );
    if (existing) {
      this.sendMessage(ws, {
        type: 'subscription',
        subscriptionId: existing.id,
        subscriptionType: message.subscriptionType,
        data: { message: 'Subscription already exists', filters: message.data },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (client.pendingSubscriptionKeys.has(subscriptionKey)) {
      this.sendMessage(ws, {
        type: 'subscription',
        subscriptionType: message.subscriptionType,
        data: { message: 'Subscription request already in progress', filters: message.data },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const subscriptionId = message.subscriptionId || `${message.subscriptionType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    client.pendingSubscriptionKeys.add(subscriptionKey);

    // Create subscription record
    const subscription: Subscription = {
      id: subscriptionId,
      type: message.subscriptionType,
      userId: client.userId,
      userRole: client.userRole,
      createdAt: new Date(),
      lastHeartbeat: new Date(),
      filters: message.data
    };

    // Use subscription registry for all subscription types
    try {
      const managerMessage = { ...message, subscriptionId };
      const subscriptionSuccess = await this.subscriptionRegistry.handleSubscription(ws, managerMessage, client);

      if (subscriptionSuccess) {
        // Store subscription only if it was successful
        client.subscriptions.set(subscriptionId, subscription);
        this.subscriptions.set(subscriptionId, subscription);

        this.sendMessage(ws, {
          type: 'subscription',
          subscriptionId,
          subscriptionType: message.subscriptionType,
          data: { message: 'Subscription created successfully', filters: message.data },
          timestamp: new Date().toISOString()
        });

        logger.info(`📡 Subscription created: ${subscriptionId} (${message.subscriptionType})`);
      }
    } finally {
      client.pendingSubscriptionKeys.delete(subscriptionKey);
    }
  }

  private handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: WebSocketClientContext): void {
    let subscriptionId = message.subscriptionId;
    let subscription = subscriptionId ? client.subscriptions.get(subscriptionId) : undefined;

    // Fallback: resolve by subscription type + filters when ID is missing or stale (e.g. after reconnect).
    if (!subscription && message.subscriptionType) {
      const subscriptionKey = this.makeSubscriptionKey(message.subscriptionType, message.data);
      subscription = Array.from(client.subscriptions.values()).find(
        (sub) => this.makeSubscriptionKey(sub.type, sub.filters) === subscriptionKey,
      );
      if (subscription) {
        subscriptionId = subscription.id;
      }
    }

    if (!subscriptionId || !subscription) {
      this.sendError(ws, 'Subscription not found');
      return;
    }

    // Remove from client's subscriptions
    client.subscriptions.delete(subscriptionId);
    this.subscriptions.delete(subscriptionId);

    // Use subscription registry for all subscription types
    this.subscriptionRegistry.handleUnsubscription(
      ws,
      { ...message, subscriptionId, subscriptionType: subscription.type },
      client,
    );

    this.sendMessage(ws, {
      type: 'unsubscription',
      subscriptionId,
      subscriptionType: subscription.type,
      data: { message: 'Unsubscription successful', filters: subscription.filters },
      timestamp: new Date().toISOString()
    });

    logger.info(`📡 Unsubscription: ${subscriptionId} for user ${client.userId}`);
  }

  private handleHeartbeat(ws: WebSocket, message: WebSocketMessage, client: WebSocketClientContext): void {
    client.lastClientHeartbeat = new Date();

    if (message.subscriptionId) {
      const subscription = client.subscriptions.get(message.subscriptionId);
      if (subscription) {
        subscription.lastHeartbeat = client.lastClientHeartbeat;
      }
    }

    client.heartbeatCount += 1;
    if (client.heartbeatCount % 4 === 0) {
      void this.refreshClientFacilityScope(client).then((changed) => {
        if (changed && ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, {
            type: 'scope_update',
            data: { facilityIds: client.facilityIds ?? [] },
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    this.sendMessage(ws, {
      type: 'heartbeat',
      data: { message: 'Heartbeat received' },
      timestamp: new Date().toISOString()
    });
  }

  private handleDiagnostics(ws: WebSocket, _message: WebSocketMessage, client: WebSocketClientContext): void {
    const logsManager = this.subscriptionRegistry.getLogsManager();
    const logsStats = logsManager ? logsManager.getStats() : { activeSubscriptions: 0, totalWatchers: 0 };
    
    const diagnostics = {
      totalClients: this.clients.size,
      totalSubscriptions: this.subscriptions.size,
      clientSubscriptions: Array.from(client.subscriptions.keys()),
      allSubscriptions: Array.from(this.subscriptions.values()).map(sub => ({
        id: sub.id,
        type: sub.type,
        userId: sub.userId,
        userRole: sub.userRole,
        createdAt: sub.createdAt,
        lastHeartbeat: sub.lastHeartbeat,
        filters: sub.filters
      })),
      logWatchers: logsStats
    };

    this.sendMessage(ws, {
      type: 'diagnostics',
      data: diagnostics,
      timestamp: new Date().toISOString()
    });
  }

  private handleDisconnection(ws: WebSocket, code = 1006, reason = ''): void {
    const client = this.clients.get(ws);
    this.pendingMessages.delete(ws);
    if (!client) return;

    // Clean up all subscriptions for this client from the global subscriptions map
    client.subscriptions.forEach((subscription) => {
      this.subscriptions.delete(subscription.id);
    });

    // Clean up all subscriptions for this client
    this.subscriptionRegistry.cleanup(ws, client);

    this.clients.delete(ws);

    if (isExpectedDashboardClose(code)) {
      logger.debug(
        `Dashboard WS closed normally user=${client.userId} code=${code} reason=${reason || '-'}`,
      );
      return;
    }

    logger.warn(
      `Dashboard WS unexpected disconnect user=${client.userId} code=${code} reason=${reason || '-'}`,
    );
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((_client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, {
            type: 'heartbeat',
            data: { message: 'Server heartbeat' },
            timestamp: new Date().toISOString()
          });
        }
      });
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
            `Dashboard WS idle timeout user=${client.userId} idle=${idleMs}ms limit=${this.idleTimeoutMs}ms`,
          );
          try {
            ws.close(1001, 'Idle timeout');
          } catch {
            /* ignore */
          }
        }
      }
    }, Math.min(2_000, Math.max(500, Math.floor(this.idleTimeoutMs / 6))));
    this.idleSweepInterval.unref();
  }

  private stopIdleSweep(): void {
    if (this.idleSweepInterval) {
      clearInterval(this.idleSweepInterval);
      this.idleSweepInterval = null;
    }
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString()
    });
  }

  private makeSubscriptionKey(type?: string, filters?: Record<string, any>): string {
    const normalizedType = type || 'unknown';
    const normalizedFilters = filters ? JSON.stringify(filters) : '';
    return `${normalizedType}:${normalizedFilters}`;
  }

  // Public methods for broadcasting updates
  public broadcastLogUpdate(logType: string, content: string): void {
    const manager = this.subscriptionRegistry.getLogsManager();
    if (manager) {
      manager.broadcastLogUpdate(logType, content);
    }
  }

  public broadcastDashboardLayoutUpdate(
    userId: string,
    layouts: unknown,
    widgetInstances: unknown[],
    apiResponse?: Record<string, unknown>
  ): void {
    const manager = this.subscriptionRegistry.getDashboardLayoutManager();
    if (manager) {
      manager.broadcastLayoutUpdate(userId, layouts as never, widgetInstances as never, undefined, apiResponse);
    }
  }

  public async broadcastGeneralStatsUpdate(): Promise<void> {
    const manager = this.subscriptionRegistry.getGeneralStatsManager();
    if (manager) {
      await manager.broadcastUpdate();
    }
  }

  public async broadcastUnitsUpdate(scope?: {
    facilityId?: string;
    unitId?: string | null;
    deviceId?: string;
  }): Promise<void> {
    const manager = this.subscriptionRegistry.getUnitsManager();
    if (manager) {
      await manager.broadcastUpdate();
    }
    try {
      const { AppRealtimeHub } = await import('@/services/app-realtime.hub');
      await AppRealtimeHub.getInstance().emitUnitsUpdate(scope);
    } catch {
      /* app hub optional during early boot/tests */
    }
  }

  public async broadcastBatteryStatusUpdate(): Promise<void> {
    const manager = this.subscriptionRegistry.getBatteryManager();
    if (manager) {
      await manager.broadcastUpdate();
    }
  }

  public async broadcastDeviceStatusUpdate(deviceId: string, facilityId?: string): Promise<void> {
    const manager = this.subscriptionRegistry.getDeviceStatusManager();
    if (manager) {
      await manager.broadcastDeviceUpdate(deviceId, facilityId);
    }
    try {
      const { AppRealtimeHub } = await import('@/services/app-realtime.hub');
      await AppRealtimeHub.getInstance().emitDeviceStatusUpdate(deviceId, facilityId);
    } catch {
      /* app hub optional during early boot/tests */
    }
  }

  public async broadcastGatewayStatusUpdate(facilityId?: string, gatewayId?: string): Promise<void> {
    const manager: any = this.subscriptionRegistry.getManager('gateway_status');
    if (manager && typeof manager.broadcastUpdate === 'function') {
      await manager.broadcastUpdate(facilityId, gatewayId);
    }
    try {
      const { AppRealtimeHub } = await import('@/services/app-realtime.hub');
      await AppRealtimeHub.getInstance().emitGatewayStatusUpdate(facilityId, gatewayId);
    } catch {
      /* app hub optional during early boot/tests */
    }
  }

  public async broadcastFacilityDeviceReachabilityRefresh(facilityId: string): Promise<void> {
    const manager = this.subscriptionRegistry.getDeviceStatusManager();
    if (manager && typeof manager.broadcastFacilityReachabilityRefresh === 'function') {
      await manager.broadcastFacilityReachabilityRefresh(facilityId);
    }
    await this.broadcastUnitsUpdate({ facilityId });
    await this.broadcastBatteryStatusUpdate();
    await this.broadcastGeneralStatsUpdate();
  }

  public async broadcastCommandQueueUpdate(): Promise<void> {
    const manager: any = this.subscriptionRegistry.getManager('command_queue');
    if (manager && typeof manager.broadcastUpdate === 'function') {
      await manager.broadcastUpdate();
    }
  }

  public async broadcastAccessCodesUpdate(facilityId?: string): Promise<void> {
    const manager = this.subscriptionRegistry.getAccessCodesManager();
    if (manager) {
      await manager.broadcastUpdate(facilityId);
    }
    try {
      const { AppRealtimeHub } = await import('@/services/app-realtime.hub');
      await AppRealtimeHub.getInstance().emitAccessCodesUpdate(facilityId);
    } catch {
      /* app hub optional during early boot/tests */
    }
  }

  public broadcastAccessCodePushStateUpdate(
    facilityId: string,
    options?: {
      refreshEffectiveCodes?: boolean;
      state?: import('@/services/access-code.service').AccessCodePushState;
    },
  ): void {
    const manager = this.subscriptionRegistry.getAccessCodePushStateManager();
    if (manager) {
      manager.broadcastPushState(facilityId, options);
    }
  }

  public async broadcastKeySharingUpdate(facilityId?: string): Promise<void> {
    const manager = this.subscriptionRegistry.getKeySharingManager();
    if (manager) {
      await manager.broadcastUpdate(facilityId);
    }
    try {
      const { AppRealtimeHub } = await import('@/services/app-realtime.hub');
      await AppRealtimeHub.getInstance().emitKeySharingUpdate(facilityId);
    } catch {
      /* app hub optional during early boot/tests */
    }
  }

  public getSubscriptionRegistry(): SubscriptionRegistry {
    return this.subscriptionRegistry;
  }

  public getStats(): any {
    const logsManager = this.subscriptionRegistry.getLogsManager();
    const logsStats = logsManager ? logsManager.getStats() : { activeSubscriptions: 0, totalWatchers: 0 };
    
    // Count subscriptions by type
    const subscriptionsByType: Record<string, number> = {};
    this.subscriptions.forEach(sub => {
      subscriptionsByType[sub.type] = (subscriptionsByType[sub.type] || 0) + 1;
    });
    
    return {
      totalClients: this.clients.size,
      totalSubscriptions: this.subscriptions.size,
      subscriptionsByType,
      logWatchers: logsStats.totalWatchers || 0,
      logs: logsStats,
      clients: Array.from(this.clients.entries()).map(([_ws, client]) => ({
        userId: client.userId,
        userRole: client.userRole,
        subscriptionCount: client.subscriptions.size,
        subscriptions: Array.from(client.subscriptions.keys())
      }))
    };
  }

  public destroy(): void {
    this.stopHeartbeat();
    this.stopIdleSweep();
    for (const ws of this.clients.keys()) {
      try {
        ws.close(1001, 'Server shutdown');
      } catch {
        // best-effort teardown for tests/runtime shutdown
      }
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.pendingMessages.clear();
    this.subscriptions.clear();
    WebSocketService.instance = undefined as any;
    logger.info('🔌 WebSocket service destroyed');
  }
}
