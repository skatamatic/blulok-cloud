import { IWebSocketService } from '@/types/websocket.types';
import { websocketDebugService } from './websocket-debug.service';

class WebSocketService implements IWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, any> = new Map();
  private subscriptionIds: Map<string, string> = new Map();
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();
  private isConnected = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    console.log('🔌 WebSocket connect() called');
    
    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    try {
      const token = localStorage.getItem('authToken');
      console.log('🔌 Auth token found:', !!token);
      
      if (!token) {
        console.log('❌ No auth token found, cannot connect WebSocket');
        return;
      }

      // Safe access to import.meta for Jest compatibility
      const getWsUrl = () => {
        // Access import.meta through globalThis to avoid Jest parse errors
        const importMeta = (globalThis as any).import?.meta || (globalThis as any)['import.meta'];
        return importMeta?.env?.VITE_WS_URL || 'ws://localhost:3000';
      };
      const wsUrl = `${getWsUrl()}/ws?token=${token}`;
      console.log('🔌 Connecting to WebSocket URL:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    console.log('✅ WebSocket connected successfully');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.startHeartbeat();

    // Notify connection handlers
    this.connectionHandlers.forEach(handler => handler(true));

    // Debug toast
    websocketDebugService.showDebugToast('success', 'WebSocket Connected', 'Connection established successfully');

    // Re-subscribe to all existing subscriptions
    this.subscriptions.forEach((filters, subscriptionType) => {
      this.subscribe(subscriptionType, filters);
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
          console.error('WebSocket error:', message.error);
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
        case 'fms_sync_status_update':
          this.handleFMSSyncStatusUpdate(message);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleDataMessage(message: any): void {
    const handlers = this.messageHandlers.get(message.subscriptionType || 'general');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleDiagnosticsMessage(message: any): void {
    const handlers = this.messageHandlers.get('diagnostics');
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleGeneralStatsUpdate(message: any): void {
    console.log('📊 Received general_stats_update message:', message);
    const handlers = this.messageHandlers.get('general_stats');
    console.log('📊 Found handlers for general_stats:', handlers?.size || 0);
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleDashboardLayoutUpdate(message: any): void {
    console.log('📊 Received dashboard_layout_update message:', message);
    const handlers = this.messageHandlers.get('dashboard_layout');
    console.log('📊 Found handlers for dashboard_layout:', handlers?.size || 0);
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleBatteryStatusUpdate(message: any): void {
    console.log('🔋 Received battery_status_update message:', message);
    const handlers = this.messageHandlers.get('battery_status');
    console.log('🔋 Found handlers for battery_status:', handlers?.size || 0);
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleFMSSyncStatusUpdate(message: any): void {
    console.log('🔄 Received fms_sync_status_update message:', message);
    const handlers = this.messageHandlers.get('fms_sync_status');
    console.log('🔄 Found handlers for fms_sync_status:', handlers?.size || 0);
    if (handlers) {
      handlers.forEach(handler => handler(message.data));
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('❌ WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean });
    this.isConnected = false;
    this.stopHeartbeat();

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

  private handleError(error: Event): void {
    console.error('❌ WebSocket error:', error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      setTimeout(() => {
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

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  public subscribe(subscriptionType: string, filters?: any): void {
    console.log('📡 WebSocket subscribe called:', { subscriptionType, filters, isConnected: this.isConnected });
    
    // If not currently subscribed, send the subscription message.
    if (!this.subscriptions.has(subscriptionType)) {
      this.subscriptions.set(subscriptionType, filters);
      const tempId = `${subscriptionType}-${Date.now()}`;
      this.subscriptionIds.set(subscriptionType, tempId);
      
      console.log('📡 Sending subscription message:', { subscriptionType, tempId });
      websocketDebugService.showDebugToast('info', 'WebSocket Subscription', `Subscribed to: ${subscriptionType}`);
      
      this.send({
        type: 'subscription',
        subscriptionType,
        data: filters,
        timestamp: new Date().toISOString()
      });
    } else {
        console.log('⚠️ Already subscribed to:', subscriptionType);
    }
  }

  public unsubscribe(subscriptionType: string): void {
    const subscriptionId = this.subscriptionIds.get(subscriptionType);
    
    if (subscriptionId) {
      this.subscriptions.delete(subscriptionType);
      this.subscriptionIds.delete(subscriptionType);
      
      // Debug toast
      websocketDebugService.showDebugToast('info', 'WebSocket Unsubscription', `Unsubscribed from: ${subscriptionType}`);
      
      this.send({
        type: 'unsubscription',
        subscriptionId,
        subscriptionType,
        timestamp: new Date().toISOString()
      });
    }
  }

  public onMessage(subscriptionType: string, handler: (data: any) => void): () => void {
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

  public getSubscriptionStatus(): { [key: string]: any } {
    const status: { [key: string]: any } = {};
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
      this.reconnectAttempts = 0; // Reset retry attempts
      this.connect();
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const websocketService = new WebSocketService();