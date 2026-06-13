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
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'data' | 'error' | 'diagnostics' | 'general_stats_update' | 'dashboard_layout_update' | 'gateway_status_update' | 'command_queue_update' | 'logs_update' | 'units_update' | 'battery_status_update' | 'device_status_update' | 'fms_sync_status_update' | 'fms_sync_progress_update' | 'dev_notifications_update' | 'notifications_update' | 'notification_created' | 'notification_read' | 'notification_deleted' | 'notifications_batch_read' | 'notifications_count_update' | 'activity_update' | 'activity_new' | 'access_codes_update' | 'key_sharing_update' | 'firmware_push_progress_update' | 'provisioning_restore_progress_update' | 'gateway_telemetry_log_update';
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
  private initialDataCache = new Map<string, { value: unknown; loadedAtMs: number }>();
  private initialDataInFlight = new Map<string, Promise<unknown>>();
  private initialDataCooldownUntil = new Map<string, number>();
  private static globalInitialDataInFlight = 0;
  private static globalInitialDataWaiters: Array<() => void> = [];

  private readonly INITIAL_DATA_TTL_MS = Math.max(
    1000,
    Number(process.env.WS_INITIAL_DATA_TTL_MS || 5000),
  );
  private readonly INITIAL_DATA_COOLDOWN_MS = Math.max(
    5000,
    Number(process.env.WS_INITIAL_DATA_COOLDOWN_MS || 30000),
  );
  private readonly INITIAL_DATA_MAX_CONCURRENCY = Math.max(
    1,
    Number(process.env.WS_INITIAL_DATA_MAX_CONCURRENCY || 3),
  );

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

    // Send initial data (manager-specific; may be DB-backed)
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

  protected getInitialDataScopeKey(client: SubscriptionClient): string {
    const facilities = (client.facilityIds || []).slice().sort().join(',');
    return `${this.getSubscriptionType()}:${client.userId}:${client.userRole}:${facilities}`;
  }

  protected isPoolAcquireTimeout(error: unknown): boolean {
    const maybeError = error as any;
    const name = typeof maybeError?.name === 'string' ? maybeError.name : '';
    const message = typeof maybeError?.message === 'string' ? maybeError.message : '';
    return name === 'KnexTimeoutError' || /Timeout acquiring a connection/i.test(message);
  }

  protected async loadInitialData<T>(
    scopeKey: string,
    loader: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    const now = Date.now();
    const cached = this.initialDataCache.get(scopeKey);
    if (cached && now - cached.loadedAtMs < this.INITIAL_DATA_TTL_MS) {
      return cached.value as T;
    }

    const cooldownUntil = this.initialDataCooldownUntil.get(scopeKey) || 0;
    if (now < cooldownUntil) {
      return (cached?.value as T) || fallback;
    }

    const inFlight = this.initialDataInFlight.get(scopeKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = (async () => {
      await this.acquireInitialDataSlot();
      try {
        const value = await loader();
        this.initialDataCache.set(scopeKey, { value, loadedAtMs: Date.now() });
        return value;
      } catch (error) {
        if (this.isPoolAcquireTimeout(error)) {
          this.initialDataCooldownUntil.set(scopeKey, Date.now() + this.INITIAL_DATA_COOLDOWN_MS);
          this.logger.warn(
            `[${this.getSubscriptionType()}] DB pool timeout during initial load (scope=${scopeKey}); cooling down for ${this.INITIAL_DATA_COOLDOWN_MS}ms`,
          );
          return (cached?.value as T) || fallback;
        }
        throw error;
      } finally {
        this.releaseInitialDataSlot();
      }
    })().finally(() => {
      this.initialDataInFlight.delete(scopeKey);
    });

    this.initialDataInFlight.set(scopeKey, promise);
    return promise;
  }

  private async acquireInitialDataSlot(): Promise<void> {
    if (BaseSubscriptionManager.globalInitialDataInFlight < this.INITIAL_DATA_MAX_CONCURRENCY) {
      BaseSubscriptionManager.globalInitialDataInFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      BaseSubscriptionManager.globalInitialDataWaiters.push(resolve);
    });
    BaseSubscriptionManager.globalInitialDataInFlight += 1;
  }

  private releaseInitialDataSlot(): void {
    BaseSubscriptionManager.globalInitialDataInFlight = Math.max(0, BaseSubscriptionManager.globalInitialDataInFlight - 1);
    const next = BaseSubscriptionManager.globalInitialDataWaiters.shift();
    if (next) next();
  }

  protected abstract sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void>;
}
