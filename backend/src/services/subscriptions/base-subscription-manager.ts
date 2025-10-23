import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';

export interface WebSocketMessage {
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update' | 'gateway_status_update' | 'command_queue_update' | 'logs_update' | 'units_update' | 'battery_status_update' | 'fms_sync_status_update' | 'fms_sync_progress_update';
  subscriptionId?: string;
  subscriptionType?: string;
  data?: any;
  error?: string;
  timestamp?: string;
}

export interface SubscriptionClient {
  userId: string;
  userRole: UserRole;
  subscriptions: Map<string, Subscription>;
  facilityIds?: string[]; // Optional facility IDs for facility-scoped users
}

export interface Subscription {
  id: string;
  type: string;
  userId: string;
  userRole: UserRole;
  filters?: Record<string, any>;
}

export interface SubscriptionManager {
  getSubscriptionType(): string;
  canSubscribe(userRole: UserRole): boolean;
  handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean>;
  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void;
  cleanup(ws: WebSocket, client: SubscriptionClient): void;
  broadcastUpdate?(data: any): void;
}

export abstract class BaseSubscriptionManager implements SubscriptionManager {
  protected watchers: Map<string, Set<WebSocket>> = new Map();
  protected clientContext: Map<string, SubscriptionClient> = new Map(); // Store client context per subscription
  protected logger = require('@/utils/logger').logger;

  abstract getSubscriptionType(): string;
  abstract canSubscribe(userRole: UserRole): boolean;

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    // Check permissions
    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    // Store client context
    this.clientContext.set(subscriptionId, client);

    // Add to watchers
    this.addWatcher(subscriptionId, ws, client);

    // Send initial data
    await this.sendInitialData(ws, subscriptionId, client);

    this.logger.info(`📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}`);
    return true;
  }

  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      this.sendError(ws, 'Subscription ID required');
      return;
    }

    this.removeWatcher(subscriptionId, ws, client);
    this.clientContext.delete(subscriptionId);
    this.logger.info(`📡 ${this.getSubscriptionType()} unsubscription: ${subscriptionId} for user ${client.userId}`);
  }

  cleanup(ws: WebSocket, _client: SubscriptionClient): void {
    // Remove this WebSocket from all watchers for this client
    this.watchers.forEach((watcherSet, key) => {
      if (watcherSet.has(ws)) {
        watcherSet.delete(ws);
        if (watcherSet.size === 0) {
          this.watchers.delete(key);
          this.clientContext.delete(key); // Also remove client context
        }
      }
    });
  }

  protected addWatcher(subscriptionId: string, ws: WebSocket, _client: SubscriptionClient): void {
    if (!this.watchers.has(subscriptionId)) {
      this.watchers.set(subscriptionId, new Set());
    }
    this.watchers.get(subscriptionId)!.add(ws);
  }

  protected removeWatcher(subscriptionId: string, ws: WebSocket, _client: SubscriptionClient): void {
    const watchers = this.watchers.get(subscriptionId);
    if (watchers) {
      watchers.delete(ws);
      if (watchers.size === 0) {
        this.watchers.delete(subscriptionId);
      }
    }
  }

  protected sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  protected sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString()
    });
  }

  protected abstract sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void>;
}
