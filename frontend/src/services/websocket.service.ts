import { IWebSocketService } from '@/types/websocket.types';
import { websocketDebugService } from './websocket-debug.service';
import { getWsBaseUrl } from './appConfig';
import {
  makeWebSocketSubscriptionKey,
  parseWebSocketSubscriptionKey,
} from '@/utils/websocket-subscription.utils';
import { isJwtExpired } from '@/utils/jwt.utils';

/**
 * Dashboard `/ws` liveness — keep in sync with backend defaults
 * (`DASHBOARD_WS_HEARTBEAT_MS` / `DASHBOARD_WS_IDLE_MS`).
 *
 * Cadence: heartbeat every 5s; treat the socket as dead after 15s without
 * server traffic (3× interval). That matches gateway inbound health practice
 * (frequent probe, multi-miss budget) without reconnect storms from a single
 * delayed timer tick.
 */
const HEARTBEAT_INTERVAL_MS = 5_000;
const SERVER_IDLE_TIMEOUT_MS = 15_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 5_000;

function isExpectedClientClose(code: number, reason: string): boolean {
  if (code === 1000 || code === 1001) return true;
  // Browser / proxy sometimes reports unclean close on tab discard with empty reason.
  if (code === 1006 && !reason) return true;
  return false;
}
class WebSocketService implements IWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectDelay = RECONNECT_BASE_DELAY_MS;
  private maxReconnectDelayMs = RECONNECT_MAX_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Map<string, Record<string, unknown> | undefined> = new Map();
  private subscriptionIds: Map<string, string> = new Map();
  private messageHandlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();
  private reconnectingHandlers: Set<(reconnecting: boolean) => void> = new Set();
  private scopeUpdateHandlers: Set<() => void> = new Set();
  private isConnected = false;
  private isReconnecting = false;
  /** True for logout, pagehide, explicit disconnect — do not auto-reconnect or log loudly. */
  private intentionalClose = false;
  private lastServerMessageAt = 0;
  private lifecycleBound = false;

  constructor() {
    this.bindLifecycleHandlers();
    this.connect();
  }

  private bindLifecycleHandlers(): void {
    if (this.lifecycleBound || typeof window === 'undefined') return;
    this.lifecycleBound = true;

    window.addEventListener('pagehide', () => {
      this.suspendForPageLifecycle('pagehide');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.resumeFromBackground();
      }
    });

    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (event.persisted) {
        this.resumeFromBackground();
      }
    });
  }

  /** Tab close / refresh / bfcache — tear down quietly; subscriptions stay for resume. */
  private suspendForPageLifecycle(reason: string): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, reason);
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.setReconnecting(false);
  }

  private resumeFromBackground(): void {
    this.intentionalClose = false;
    if (!localStorage.getItem('authToken')) return;

    const stale =
      this.isConnected
      && this.lastServerMessageAt > 0
      && Date.now() - this.lastServerMessageAt >= SERVER_IDLE_TIMEOUT_MS;

    if (this.isWebSocketConnected() && !stale) return;

    if (stale && this.ws) {
      try {
        this.ws.close(1001, 'Stale after background');
      } catch {
        /* ignore */
      }
      this.ws = null;
      this.isConnected = false;
    }

    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  private connect(): void {
    // Do not open a duplicate connection when one is already healthy/connecting.
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');

      if (!token) {
        return;
      }

      if (isJwtExpired(token)) {
        console.warn('WebSocket: auth token expired — reconnect after signing in again');
        return;
      }

      const wsBase = getWsBaseUrl().trim();
      if (!wsBase) {
        console.warn(
          'WebSocket: missing base URL. Set VITE_WS_URL or VITE_API_URL (see frontend .env.example).',
        );
        return;
      }

      const wsUrl = `${wsBase}/ws?token=${token}`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = (event) => this.handleOpen(event, socket);
      socket.onmessage = this.handleMessage.bind(this);
      socket.onclose = (event) => this.handleClose(event, socket);
      socket.onerror = (error) => this.handleError(error, socket);

    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    }
  }

  private handleOpen(_event: Event, socket: WebSocket): void {
    // Ignore stale socket callbacks after a newer socket has been created.
    if (socket !== this.ws) return;
    this.intentionalClose = false;
    this.isConnected = true;
    this.setReconnecting(false);
    this.reconnectAttempts = 0;
    this.lastServerMessageAt = Date.now();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.startHeartbeat();

    // Notify connection handlers
    this.connectionHandlers.forEach(handler => handler(true));

    // Debug toast
    websocketDebugService.showDebugToast('success', 'WebSocket Connected', 'Connection established successfully');

    // Re-subscribe to all existing subscriptions on reconnect
    // The keys in subscriptions are in format "type" or "type:filters_json"
    // We need to parse them and re-send the subscription messages
    const subscriptionsToResend: Array<{ type: string; filters?: Record<string, unknown> }> = [];
    
    this.subscriptions.forEach((filters, subscriptionKey) => {
      const { subscriptionType, filters: parsedFilters } = parseWebSocketSubscriptionKey(subscriptionKey);
      subscriptionsToResend.push({ type: subscriptionType, filters: parsedFilters ?? filters });
    });

    // Clear existing subscription state so we can re-create them
    this.subscriptions.clear();
    this.subscriptionIds.clear();

    // Re-subscribe with original type and filters (always send to server — local map may be stale)
    subscriptionsToResend.forEach(({ type, filters }) => {
      this.reassertSubscription(type, filters);
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      this.lastServerMessageAt = Date.now();
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'data':
          this.handleDataMessage(message);
          break;
        case 'subscription':
          if (message.subscriptionId && message.subscriptionType) {
            const ackFilters = message.data?.filters as Record<string, unknown> | undefined;
            const subscriptionKey = makeWebSocketSubscriptionKey(message.subscriptionType, ackFilters);
            if (this.subscriptions.has(subscriptionKey)) {
              this.subscriptionIds.set(subscriptionKey, message.subscriptionId);
            }
          }
          break;
        case 'unsubscription':
          break;
        case 'heartbeat':
          // Heartbeat received, no action needed
          break;
        case 'error':
          if (typeof message.error === 'string' && message.error.includes('Subscription not found')) {
            console.debug('WebSocket subscription cleanup notice:', message.error);
          } else {
            console.error('WebSocket error:', message.error);
          }
          break;
        case 'diagnostics':
          this.handleDiagnosticsMessage(message);
          break;
        case 'general_stats_update':
          this.handleGeneralStatsUpdate(message);
          break;
        case 'dashboard_layout_update':
          this.handleDashboardLayoutUpdate(message);
          break;
        case 'battery_status_update':
          this.handleBatteryStatusUpdate(message);
          break;
        case 'command_queue_update':
          this.handleCommandQueueUpdate(message);
          break;
        case 'gateway_status_update':
          this.handleGatewayStatusUpdate(message);
          break;
        case 'fms_sync_status_update':
          this.handleFMSSyncStatusUpdate(message);
          break;
        case 'fms_sync_progress_update':
          this.handleFMSSyncProgressUpdate(message);
          break;
        case 'firmware_push_progress_update':
          this.handleFirmwarePushProgressUpdate(message);
          break;
        case 'gateway_recovery_progress_update':
          this.handleGatewayRecoveryProgressUpdate(message);
          break;
        case 'gateway_recovery_status_update':
          this.handleGatewayRecoveryStatusUpdate(message);
          break;
        case 'gateway_telemetry_log_update':
          this.handleGatewayTelemetryLogUpdate(message);
          break;
        case 'access_session_trace_update':
          this.handleAccessSessionTraceUpdate(message);
          break;
        case 'gateway_device_sync_log_update':
          this.handleGatewayDeviceSyncLogUpdate(message);
          break;
        case 'device_status_update':
          this.handleDeviceStatusUpdate(message);
          break;
        case 'units_update':
          this.handleUnitsUpdate(message);
          break;
        case 'activity_update':
          this.handleActivityUpdate(message);
          break;
        case 'activity_new':
          this.handleActivityNew(message);
          break;
        case 'access_session_upsert':
          this.handleAccessSessionUpsert(message);
          break;
        case 'access_codes_update':
          this.handleAccessCodesUpdate(message);
          break;
        case 'access_code_push_state_update':
          this.handleAccessCodePushStateUpdate(message);
          break;
        case 'key_sharing_update':
          this.handleKeySharingUpdate(message);
          break;
        case 'notifications_update':
        case 'notification_created':
        case 'notification_read':
        case 'notifications_batch_read':
        case 'notifications_count_update':
        case 'notification_deleted':
          this.handleNotificationsMessage(message);
          break;
        case 'scope_update':
          this.scopeUpdateHandlers.forEach((handler) => handler());
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleDataMessage(message: { subscriptionType?: string; data?: unknown }): void {
    const handlers = this.messageHandlers.get(message.subscriptionType || 'general');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleDiagnosticsMessage(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('diagnostics');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleCommandQueueUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('command_queue');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGatewayStatusUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('gateway_status');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }

    // Optional: show toast on status change could be handled by subscribers
  }

  private handleGeneralStatsUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('general_stats');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleDashboardLayoutUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('dashboard_layout');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleBatteryStatusUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('battery_status');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleFMSSyncStatusUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('fms_sync_status');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleFMSSyncProgressUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('fms_sync_progress');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleFirmwarePushProgressUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('firmware_push_progress');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGatewayRecoveryProgressUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('gateway_recovery_progress');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGatewayRecoveryStatusUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('gateway_recovery_status');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGatewayTelemetryLogUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('gateway_telemetry_logs');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleAccessSessionTraceUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('access_session_trace');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGatewayDeviceSyncLogUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('gateway_device_sync_logs');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleDeviceStatusUpdate(message: unknown): void {
    const handlers = this.messageHandlers.get('device_status');
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  private handleUnitsUpdate(message: unknown): void {
    const handlers = this.messageHandlers.get('units');
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  private handleActivityUpdate(message: { type?: string; data?: unknown }): void {
    const handlers = this.messageHandlers.get('activity');
    if (handlers) {
      const payload = { eventType: message.type, payload: message.data };
      handlers.forEach(handler => handler(payload));
    }
  }

  private handleActivityNew(message: { type?: string; data?: unknown }): void {
    const handlers = this.messageHandlers.get('activity');
    if (handlers) {
      const payload = { eventType: message.type, payload: message.data };
      handlers.forEach(handler => handler(payload));
    }
  }

  private handleAccessSessionUpsert(message: { type?: string; data?: unknown }): void {
    const handlers = this.messageHandlers.get('activity');
    if (handlers) {
      const payload = { eventType: message.type ?? 'access_session_upsert', payload: message.data };
      handlers.forEach(handler => handler(payload));
    }
  }

  private handleAccessCodesUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('access_codes');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleAccessCodePushStateUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('access_code_push_state');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleKeySharingUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('key_sharing');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  /** Real-time notification feed (subscription type `notifications` on the server). */
  private handleNotificationsMessage(message: {
    type?: string;
    data?: unknown;
    subscriptionId?: string;
  }): void {
    const handlers = this.messageHandlers.get('notifications');
    if (handlers) {
      const payload = { eventType: message.type, payload: message.data };
      handlers.forEach(handler => handler(payload));
    }
  }

  private handleClose(event: CloseEvent, socket: WebSocket): void {
    // Ignore stale socket callbacks after a newer socket has been created.
    if (socket !== this.ws) return;

    const expected = this.intentionalClose || isExpectedClientClose(event.code, event.reason || '');
    if (!expected) {
      console.warn('WebSocket unexpected close:', {
        code: event.code,
        reason: event.reason || '-',
        wasClean: event.wasClean,
      });
      websocketDebugService.showDebugToast(
        'warning',
        'WebSocket Disconnected',
        `Connection lost (Code: ${event.code}). Reconnecting…`,
      );
    }

    this.isConnected = false;
    this.stopHeartbeat();
    this.ws = null;
    this.subscriptionIds.clear();
    this.connectionHandlers.forEach(handler => handler(false));

    if (this.intentionalClose) {
      this.setReconnecting(false);
      return;
    }

    this.setReconnecting(true);
    this.scheduleReconnect();
  }

  private setReconnecting(reconnecting: boolean): void {
    if (this.isReconnecting === reconnecting) return;
    this.isReconnecting = reconnecting;
    this.reconnectingHandlers.forEach(handler => handler(reconnecting));
  }

  private handleError(error: Event, socket: WebSocket): void {
    if (socket !== this.ws) return;
    if (this.intentionalClose) return;
    console.warn('WebSocket transport error', error);
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) {
      return;
    }
    if (!localStorage.getItem('authToken')) {
      return;
    }
    const token = localStorage.getItem('authToken');
    if (token && isJwtExpired(token)) {
      return;
    }

    this.reconnectAttempts++;
    // First retry is immediate after a detected dead socket / unexpected close;
    // subsequent attempts back off 1s → 2s → 4s → cap 5s.
    const delay = this.reconnectAttempts <= 1
      ? 0
      : Math.min(
          this.maxReconnectDelayMs,
          this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 2),
        );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      if (
        this.lastServerMessageAt > 0
        && Date.now() - this.lastServerMessageAt >= SERVER_IDLE_TIMEOUT_MS
      ) {
        console.warn('WebSocket server heartbeat timeout — forcing reconnect');
        try {
          this.ws.close(1001, 'Server heartbeat timeout');
        } catch {
          /* ignore */
        }
        return;
      }

      this.send({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public subscribe(subscriptionType: string, filters?: Record<string, unknown>): void {
    const subscriptionKey = makeWebSocketSubscriptionKey(subscriptionType, filters);

    const displayName = filters
      ? `${subscriptionType} ${JSON.stringify(filters)}`
      : subscriptionType;

    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, filters);
      websocketDebugService.showDebugToast('info', 'WS Sub', `+ ${displayName}`);
      this.reassertSubscription(subscriptionType, filters);
    } else {
      websocketDebugService.showDebugToast('warning', 'WS Sub (dup)', `Already: ${displayName}`);
    }
  }

  /**
   * Register or refresh a server-side subscription. Sends the subscription frame whenever
   * the transport is open — used on reconnect and by WebSocketContext so local handler
   * registration cannot drift from server watcher state.
   */
  public reassertSubscription(subscriptionType: string, filters?: Record<string, unknown>): void {
    const subscriptionKey = makeWebSocketSubscriptionKey(subscriptionType, filters);
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, filters);
    }
    const subscriptionId = `${subscriptionKey}-${Date.now()}`;
    this.subscriptionIds.set(subscriptionKey, subscriptionId);

    if (this.isWebSocketConnected()) {
      this.send({
        type: 'subscription',
        subscriptionType,
        subscriptionId,
        data: filters,
        timestamp: new Date().toISOString(),
      });
    }
  }

  public unsubscribe(subscriptionType: string, filters?: Record<string, unknown>): void {
    const subscriptionKey = makeWebSocketSubscriptionKey(subscriptionType, filters);
    const subscriptionId = this.subscriptionIds.get(subscriptionKey);

    if (subscriptionId) {
      this.subscriptions.delete(subscriptionKey);
      this.subscriptionIds.delete(subscriptionKey);

      const displayName = filters
        ? `${subscriptionType} ${JSON.stringify(filters)}`
        : subscriptionType;
      websocketDebugService.showDebugToast('info', 'WS Unsub', `- ${displayName}`);

      if (this.isWebSocketConnected()) {
        this.send({
          type: 'unsubscription',
          subscriptionId,
          subscriptionType,
          data: filters,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (this.isWebSocketConnected()) {
      this.send({
        type: 'unsubscription',
        subscriptionType,
        data: filters,
        timestamp: new Date().toISOString(),
      });
    }
  }

  public hasSubscription(subscriptionType: string, filters?: Record<string, unknown>): boolean {
    return this.subscriptions.has(makeWebSocketSubscriptionKey(subscriptionType, filters));
  }

  public onMessage(subscriptionType: string, handler: (data: unknown) => void): () => void {
    console.log('📡 Registering message handler for:', subscriptionType);
    if (!this.messageHandlers.has(subscriptionType)) {
      this.messageHandlers.set(subscriptionType, new Set());
    }
    
    this.messageHandlers.get(subscriptionType)!.add(handler);
    console.log('📡 Total handlers for', subscriptionType, ':', this.messageHandlers.get(subscriptionType)!.size);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(subscriptionType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(subscriptionType);
        }
      }
    };
  }

  public onConnectionChange(handler: (connected: boolean) => void): () => void {
    console.log('📡 Registering connection handler, total handlers:', this.connectionHandlers.size + 1);
    this.connectionHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      console.log('📡 Unregistering connection handler, remaining handlers:', this.connectionHandlers.size - 1);
      this.connectionHandlers.delete(handler);
    };
  }

  public onReconnectingChange(handler: (reconnecting: boolean) => void): () => void {
    this.reconnectingHandlers.add(handler);
    return () => {
      this.reconnectingHandlers.delete(handler);
    };
  }

  public onScopeUpdate(handler: () => void): () => void {
    this.scopeUpdateHandlers.add(handler);
    return () => {
      this.scopeUpdateHandlers.delete(handler);
    };
  }

  public isWebSocketReconnecting(): boolean {
    return this.isReconnecting;
  }

  public requestDiagnostics(): void {
    this.send({
      type: 'diagnostics',
      timestamp: new Date().toISOString()
    });
  }

  public isWebSocketConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /** True after logout, pagehide, or explicit disconnect — not an unexpected outage. */
  public isIntentionalDisconnect(): boolean {
    return this.intentionalClose;
  }

  public getSubscriptionStatus(): Record<string, { filters?: Record<string, unknown>; subscriptionId?: string }> {
    const status: Record<string, { filters?: Record<string, unknown>; subscriptionId?: string }> = {};
    this.subscriptions.forEach((filters, type) => {
      status[type] = {
        filters,
        subscriptionId: this.subscriptionIds.get(type)
      };
    });
    return status;
  }

  public unsubscribeAll(): void {
    const subscriptionKeys = Array.from(this.subscriptions.keys());
    subscriptionKeys.forEach((subscriptionKey) => {
      const { subscriptionType, filters } = parseWebSocketSubscriptionKey(subscriptionKey);
      this.unsubscribe(subscriptionType, filters);
    });
  }

  /** Close any open socket and connect with the latest auth token from localStorage. */
  public forceReconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Token refresh');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.intentionalClose = false;
    this.connect();
  }

  public retryConnectionIfNeeded(): void {
    this.intentionalClose = false;
    const token = localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    if (this.isWebSocketConnected()) {
      return;
    }

    // Drop dead sockets so connect() can open a fresh transport.
    if (this.ws && this.ws.readyState !== WebSocket.CONNECTING) {
      this.ws = null;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.setReconnecting(false);
    this.connectionHandlers.forEach(handler => handler(false));
  }
}

export const websocketService = new WebSocketService();