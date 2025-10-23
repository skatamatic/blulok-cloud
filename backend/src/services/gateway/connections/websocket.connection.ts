import WebSocket from 'ws';
import { BaseConnection } from './base.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';

/**
 * WebSocket connection implementation for gateway communication
 */
export class WebSocketConnection extends BaseConnection {
  private ws: WebSocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

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
