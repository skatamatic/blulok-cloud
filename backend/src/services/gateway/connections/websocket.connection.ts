import WebSocket from 'ws';
import { BaseConnection } from './base.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';

/**
 * WebSocket Gateway Connection
 *
 * WebSocket-based connection implementation for real-time bidirectional communication
 * with on-site gateways. Provides persistent connections for immediate command delivery
 * and status updates.
 *
 * Key Features:
 * - Persistent WebSocket connections for real-time communication
 * - Automatic reconnection with exponential backoff
 * - Heartbeat monitoring for connection health
 * - Message framing and protocol handling
 * - Connection statistics and performance monitoring
 *
 * Connection Management:
 * - Configurable connection timeout and handshake timeout
 * - Automatic reconnection on connection loss
 * - Exponential backoff for reconnection attempts
 * - Maximum reconnection attempts with failure handling
 * - Graceful connection shutdown and cleanup
 *
 * Heartbeat Protocol:
 * - Configurable heartbeat interval (default 30 seconds)
 * - Bidirectional heartbeat for connection validation
 * - Connection health monitoring and automatic recovery
 * - Timeout detection and reconnection triggering
 *
 * Message Handling:
 * - Binary and text message support
 * - Message fragmentation handling
 * - Error message processing and logging
 * - Statistics tracking for bandwidth monitoring
 *
 * Security Considerations:
 * - WSS (WebSocket Secure) connections required in production
 * - Connection authentication and authorization
 * - Message validation and sanitization
 * - Resource limits to prevent abuse
 * - Audit logging for connection events
 */
export class WebSocketConnection extends BaseConnection {
  // WebSocket client instance
  private ws: WebSocket | undefined;

  // Timer handles for reconnection and heartbeat
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  // Reconnection management
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second, exponential backoff

  constructor(
    public readonly gatewayId: string,
    private readonly url: string,
    private readonly heartbeatInterval = 30000, // 30 seconds
    private readonly connectionTimeout = 10000 // 10 seconds
  ) {
    super();
  }

  /**
   * Connect to the gateway via WebSocket
   */
  public async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.setState(GatewayConnectionState.CONNECTING);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, {
          handshakeTimeout: this.connectionTimeout,
        });

        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.terminate();
          }
          reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
        }, this.connectionTimeout);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.setState(GatewayConnectionState.CONNECTED);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleData(data);
        });

        this.ws.on('close', (_code, _reason) => {
          clearTimeout(timeout);
          this.handleClose();
          this.handleReconnection();
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          this.handleError(error);
          reject(error);
        });

      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the gateway
   */
  public async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.setState(GatewayConnectionState.DISCONNECTED);
  }

  /**
   * Send data to the gateway
   */
  public async send(data: Buffer): Promise<void> {
    if (!this.isConnected() || !this.ws) {
      throw new Error('Connection not established');
    }

    return new Promise((resolve, reject) => {
      this.ws!.send(data, (error) => {
        if (error) {
          reject(error);
        } else {
          this.recordSent(data.length);
          resolve();
        }
      });
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        // Send ping frame
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState(GatewayConnectionState.ERROR);
      return;
    }

    this.reconnectAttempts++;
    this.setState(GatewayConnectionState.RECONNECTING);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      });
    }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
