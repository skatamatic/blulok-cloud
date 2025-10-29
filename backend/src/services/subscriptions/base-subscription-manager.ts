import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';

/**
 * WebSocket Message Interface
 *
 * Defines the protocol for all WebSocket communication in the BluLok system.
 * Messages are JSON-encoded and support various real-time operations including
 * subscriptions, heartbeats, data updates, and error reporting.
 */
export interface WebSocketMessage {
  /** Message type determining how the message should be processed */
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update' | 'gateway_status_update' | 'command_queue_update' | 'logs_update' | 'units_update' | 'battery_status_update' | 'fms_sync_status_update' | 'fms_sync_progress_update';
  /** Unique subscription identifier for targeted operations */
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
 * Subscription Client Interface
 *
 * Represents a WebSocket client that has authenticated and established subscriptions.
 * Contains client identity, permissions, and active subscription tracking.
 */
export interface SubscriptionClient {
  /** Unique user identifier */
  userId: string;
  /** User's role for access control */
  userRole: UserRole;
  /** Map of active subscriptions keyed by subscription ID */
  subscriptions: Map<string, Subscription>;
  /** Facility IDs this user can access (facility-scoped roles only) */
  facilityIds?: string[];
}

/**
 * Subscription Interface
 *
 * Represents an active subscription to a real-time data stream.
 * Subscriptions are created when clients request specific data feeds
 * and are automatically managed by subscription managers.
 */
export interface Subscription {
  /** Unique subscription identifier */
  id: string;
  /** Type of subscription (e.g., 'gateway_status', 'device_updates') */
  type: string;
  /** User who owns this subscription */
  userId: string;
  /** User's role at time of subscription */
  userRole: UserRole;
  /** Optional filters to limit subscription scope */
  filters?: Record<string, any>;
}

/**
 * Subscription Manager Interface
 *
 * Defines the contract for all subscription managers in the system.
 * Each manager handles a specific type of real-time data subscription,
 * managing client connections, data filtering, and message routing.
 */
export interface SubscriptionManager {
  /** Returns the subscription type this manager handles */
  getSubscriptionType(): string;
  /** Determines if a user role can subscribe to this data type */
  canSubscribe(userRole: UserRole): boolean;
  /** Handles new subscription requests */
  handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean>;
  /** Handles subscription cancellation */
  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void;
  /** Cleans up subscriptions when client disconnects */
  cleanup(ws: WebSocket, client: SubscriptionClient): void;
  /** Optional: Broadcasts updates to all subscribers */
  broadcastUpdate?(data: any): void;
}

/**
 * Base Subscription Manager
 *
 * Abstract base class providing common functionality for all subscription managers.
 * Implements the core subscription lifecycle including connection management,
 * permission checking, message routing, and cleanup operations.
 *
 * Key Features:
 * - Connection tracking with WebSocket management
 * - Role-based access control for subscriptions
 * - Automatic cleanup of stale connections
 * - Error handling and logging
 * - Initial data provisioning for new subscriptions
 *
 * Security Considerations:
 * - All subscriptions require role-based permission checks
 * - Client context validated on each operation
 * - Connection cleanup prevents resource leaks
 * - Error messages don't leak sensitive information
 */
export abstract class BaseSubscriptionManager implements SubscriptionManager {
  // Maps subscription IDs to sets of watching WebSocket connections
  protected watchers: Map<string, Set<WebSocket>> = new Map();

  // Maps subscription IDs to client context for access control
  protected clientContext: Map<string, SubscriptionClient> = new Map();

  protected logger = require('@/utils/logger').logger;

  /**
   * Returns the subscription type this manager handles.
   * Must be implemented by concrete managers.
   */
  abstract getSubscriptionType(): string;

  /**
   * Determines if a user role can subscribe to this data type.
   * Must be implemented by concrete managers.
   */
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
