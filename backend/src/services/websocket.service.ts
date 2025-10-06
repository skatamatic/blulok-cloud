import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { verify } from 'jsonwebtoken';
import { config } from '@/config/environment';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { SubscriptionRegistry } from './subscriptions/subscription-registry';

export interface Subscription {
  id: string;
  type: string;
  userId: string;
  userRole: UserRole;
  createdAt: Date;
  lastHeartbeat: Date;
  filters?: Record<string, any>;
}

export interface WebSocketMessage {
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update';
  subscriptionId?: string;
  subscriptionType?: string;
  data?: any;
  error?: string;
  timestamp?: string;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { userId: string; userRole: UserRole; subscriptions: Map<string, Subscription> }> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscriptionRegistry: SubscriptionRegistry;

  private constructor() {
    this.subscriptionRegistry = new SubscriptionRegistry();
    this.startHeartbeat();
  }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(server: any): void {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    logger.info('🔌 WebSocket server initialized');
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    try {
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'No authentication token provided');
        return;
      }

      const decoded = verify(token, config.jwt.secret) as any;
      const client = {
        userId: decoded.userId,
        userRole: decoded.role as UserRole,
        subscriptions: new Map<string, Subscription>()
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

    // Store subscription
    client.subscriptions.set(subscriptionId, subscription);
    this.subscriptions.set(subscriptionId, subscription);

    // Use subscription registry for all subscription types
    await this.subscriptionRegistry.handleSubscription(ws, message, client);

    this.sendMessage(ws, {
      type: 'subscription',
      subscriptionId,
      subscriptionType: message.subscriptionType,
      data: { message: 'Subscription created successfully' },
      timestamp: new Date().toISOString()
    });

    logger.info(`📡 Subscription created: ${subscriptionId} (${message.subscriptionType})`);
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
