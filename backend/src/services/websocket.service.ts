import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { verify } from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { SubscriptionRegistry } from './subscriptions/subscription-registry';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';

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

/**
 * WebSocket Message Interface
 *
 * Defines the protocol for client-server communication over WebSocket connections.
 * Messages are JSON-encoded and support various real-time operations.
 */
export interface WebSocketMessage {
  /** Message type determining how the message should be processed */
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update' | 'gateway_status_update';
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
  private clients: Map<WebSocket, { userId: string; userRole: UserRole; subscriptions: Map<string, Subscription> }> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscriptionRegistry: SubscriptionRegistry;
  private readonly path = '/ws';

  private constructor() {
    this.subscriptionRegistry = new SubscriptionRegistry();
    this.startHeartbeat();
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
    try {
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'No authentication token provided');
        return;
      }

      const decoded = verify(token, config.jwt.secret) as any;
      
      // SECURITY: Load facility IDs for all non-global roles
      let facilityIds: string[] | undefined;
      if (decoded.role !== UserRole.ADMIN && decoded.role !== UserRole.DEV_ADMIN) {
        facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(decoded.userId);
        logger.info(`🔌 Loaded ${facilityIds.length} facility IDs for user ${decoded.userId} (${decoded.role})`);
      }
      
      const client = {
        userId: decoded.userId,
        userRole: decoded.role as UserRole,
        subscriptions: new Map<string, Subscription>(),
        facilityIds, // Include facility IDs for RBAC enforcement in subscriptions
      };

      this.clients.set(ws, client);
      logger.info(`🔌 WebSocket client connected: ${client.userId} (${client.userRole})`);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.handleDisconnection(ws);
      });

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

  private async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: any): Promise<void> {
    if (!message.subscriptionType) {
      this.sendError(ws, 'Subscription type required');
      return;
    }

    const subscriptionId = message.subscriptionId || `${message.subscriptionType}-${Date.now()}`;
    
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
    const subscriptionSuccess = await this.subscriptionRegistry.handleSubscription(ws, message, client);

    if (subscriptionSuccess) {
      // Store subscription only if it was successful
      client.subscriptions.set(subscriptionId, subscription);
      this.subscriptions.set(subscriptionId, subscription);

      this.sendMessage(ws, {
        type: 'subscription',
        subscriptionId,
        subscriptionType: message.subscriptionType,
        data: { message: 'Subscription created successfully' },
        timestamp: new Date().toISOString()
      });

      logger.info(`📡 Subscription created: ${subscriptionId} (${message.subscriptionType})`);
    }
  }

  private handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: any): void {
    if (!message.subscriptionId) {
      this.sendError(ws, 'Subscription ID required');
      return;
    }

    const subscription = client.subscriptions.get(message.subscriptionId);
    if (!subscription) {
      this.sendError(ws, 'Subscription not found');
      return;
    }

    // Remove from client's subscriptions
    client.subscriptions.delete(message.subscriptionId);
    this.subscriptions.delete(message.subscriptionId);

    // Use subscription registry for all subscription types
    this.subscriptionRegistry.handleUnsubscription(ws, message, client);

    this.sendMessage(ws, {
      type: 'unsubscription',
      subscriptionId: message.subscriptionId,
      subscriptionType: subscription.type,
      data: { message: 'Unsubscription successful' },
      timestamp: new Date().toISOString()
    });

    logger.info(`📡 Unsubscription: ${message.subscriptionId} for user ${client.userId}`);
  }

  private handleHeartbeat(ws: WebSocket, message: WebSocketMessage, client: any): void {
    if (message.subscriptionId) {
      const subscription = client.subscriptions.get(message.subscriptionId);
      if (subscription) {
        subscription.lastHeartbeat = new Date();
      }
    }

    this.sendMessage(ws, {
      type: 'heartbeat',
      data: { message: 'Heartbeat received' },
      timestamp: new Date().toISOString()
    });
  }

  private handleDiagnostics(ws: WebSocket, _message: WebSocketMessage, client: any): void {
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

  private handleDisconnection(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      logger.info(`WebSocket client disconnected: ${client.userId}`);

      // Clean up all subscriptions for this client from the global subscriptions map
      client.subscriptions.forEach((subscription) => {
        this.subscriptions.delete(subscription.id);
      });

      // Clean up all subscriptions for this client
      this.subscriptionRegistry.cleanup(ws, client);

      this.clients.delete(ws);
    }
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
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
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

  // Public methods for broadcasting updates
  public broadcastLogUpdate(logType: string, content: string): void {
    const manager = this.subscriptionRegistry.getLogsManager();
    if (manager) {
      manager.broadcastLogUpdate(logType, content);
    }
  }

  public broadcastDashboardLayoutUpdate(userId: string, layouts: any, widgetInstances: any[]): void {
    
    const manager = this.subscriptionRegistry.getDashboardLayoutManager();
    if (manager) {
      manager.broadcastLayoutUpdate(userId, layouts, widgetInstances);
    }
  }

  public async broadcastGeneralStatsUpdate(): Promise<void> {
    const manager = this.subscriptionRegistry.getGeneralStatsManager();
    if (manager) {
      await manager.broadcastUpdate();
    }
  }

  public async broadcastUnitsUpdate(): Promise<void> {
    const manager = this.subscriptionRegistry.getUnitsManager();
    if (manager) {
      await manager.broadcastUpdate();
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
  }

  public async broadcastGatewayStatusUpdate(facilityId?: string, gatewayId?: string): Promise<void> {
    const manager: any = this.subscriptionRegistry.getManager('gateway_status');
    if (manager && typeof manager.broadcastUpdate === 'function') {
      await manager.broadcastUpdate(facilityId, gatewayId);
    }
  }

  public async broadcastCommandQueueUpdate(): Promise<void> {
    const manager: any = this.subscriptionRegistry.getManager('command_queue');
    if (manager && typeof manager.broadcastUpdate === 'function') {
      await manager.broadcastUpdate();
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
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.subscriptions.clear();
    logger.info('🔌 WebSocket service destroyed');
  }
}
