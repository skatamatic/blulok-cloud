import { IWebSocketService } from '@/types/websocket.types';
import { websocketDebugService } from './websocket-debug.service';
import { getWsBaseUrl } from './appConfig';

class WebSocketService implements IWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, Record<string, unknown> | undefined> = new Map();
  private subscriptionIds: Map<string, string> = new Map();
  private messageHandlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();
  private isConnected = false;

  constructor() {
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
    this.isConnected = true;
    this.reconnectAttempts = 0;
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
      // Extract the base type from the key
      const colonIndex = subscriptionKey.indexOf(':');
      const baseType = colonIndex >= 0 ? subscriptionKey.substring(0, colonIndex) : subscriptionKey;
      subscriptionsToResend.push({ type: baseType, filters });
    });

    // Clear existing subscription state so we can re-create them
    this.subscriptions.clear();
    this.subscriptionIds.clear();

    // Re-subscribe with original type and filters
    subscriptionsToResend.forEach(({ type, filters }) => {
      this.subscribe(type, filters);
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'data':
          this.handleDataMessage(message);
          break;
        case 'subscription':
          if (message.subscriptionId && message.subscriptionType) {
            this.subscriptionIds.set(message.subscriptionType, message.subscriptionId);
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
        case 'provisioning_restore_progress_update':
          this.handleProvisioningRestoreProgressUpdate(message);
          break;
        case 'gateway_telemetry_log_update':
          this.handleGatewayTelemetryLogUpdate(message);
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
        case 'notifications_update':
        case 'notification_created':
        case 'notification_read':
        case 'notifications_batch_read':
        case 'notifications_count_update':
        case 'notification_deleted':
          this.handleNotificationsMessage(message);
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

  private handleProvisioningRestoreProgressUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('provisioning_restore_progress');
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

  private handleActivityUpdate(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('activity');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleActivityNew(message: { data?: unknown }): void {
    const handlers = this.messageHandlers.get('activity');
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
    console.log('❌ WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean });
    this.isConnected = false;
    this.stopHeartbeat();
    this.ws = null;

    // Clear subscription state on disconnect so we can resubscribe properly on reconnect
    // Note: We keep the subscriptions Map so we know what to resubscribe to, but clear the IDs
    this.subscriptionIds.clear();

    // Notify connection handlers
    this.connectionHandlers.forEach(handler => handler(false));

    // Debug toast
    if (event.code === 1000) {
      websocketDebugService.showDebugToast('info', 'WebSocket Disconnected', 'Connection closed normally');
    } else {
      websocketDebugService.showDebugToast('warning', 'WebSocket Disconnected', `Connection lost (Code: ${event.code}). Attempting to reconnect...`);
    }

    if (event.code !== 1000) { // Not a normal closure
      this.scheduleReconnect();
    }
  }

  private handleError(error: Event, socket: WebSocket): void {
    if (socket !== this.ws) return;
    console.error('❌ WebSocket error:', error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached. WebSocket connection failed.');
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        });
      }
    }, 30000); // Send heartbeat every 30 seconds
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
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  public subscribe(subscriptionType: string, filters?: Record<string, unknown>): void {
    // Create a unique key that includes filters for proper tracking
    const subscriptionKey = filters 
      ? `${subscriptionType}:${JSON.stringify(filters)}`
      : subscriptionType;
    
    const displayName = filters 
      ? `${subscriptionType} ${JSON.stringify(filters)}`
      : subscriptionType;
    
    // If not currently subscribed to this type+filter combination, send the subscription message.
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, filters);
      const tempId = `${subscriptionKey}-${Date.now()}`;
      this.subscriptionIds.set(subscriptionKey, tempId);
      
      websocketDebugService.showDebugToast('info', 'WS Sub', `+ ${displayName}`);
      
      this.send({
        type: 'subscription',
        subscriptionType,
        data: filters,
        timestamp: new Date().toISOString()
      });
    } else {
      // Already subscribed at service level
      websocketDebugService.showDebugToast('warning', 'WS Sub (dup)', `Already: ${displayName}`);
    }
  }

  public unsubscribe(subscriptionType: string, filters?: Record<string, unknown>): void {
    // Create the same unique key used when subscribing
    const subscriptionKey = filters 
      ? `${subscriptionType}:${JSON.stringify(filters)}`
      : subscriptionType;
    
    const subscriptionId = this.subscriptionIds.get(subscriptionKey);
    
    if (subscriptionId) {
      this.subscriptions.delete(subscriptionKey);
      this.subscriptionIds.delete(subscriptionKey);
      
      const displayName = filters 
        ? `${subscriptionType} ${JSON.stringify(filters)}`
        : subscriptionType;
      // Debug toast
      websocketDebugService.showDebugToast('info', 'WS Unsub', `- ${displayName}`);
      
      this.send({
        type: 'unsubscription',
        subscriptionId,
        subscriptionType,
        timestamp: new Date().toISOString()
      });
    }
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

  public requestDiagnostics(): void {
    this.send({
      type: 'diagnostics',
      timestamp: new Date().toISOString()
    });
  }

  public isWebSocketConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
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
    const subscriptionTypes = Array.from(this.subscriptions.keys());
    subscriptionTypes.forEach(type => {
      this.unsubscribe(type);
    });
  }

  public retryConnectionIfNeeded(): void {
    const token = localStorage.getItem('authToken');
    if (token && !this.isWebSocketConnected()) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.reconnectAttempts = 0; // Reset retry attempts
      this.connect();
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const websocketService = new WebSocketService();