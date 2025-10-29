import { EventEmitter } from 'events';
import { IGatewayConnection, GatewayConnectionState } from '../../../types/gateway.types';

/**
 * Base Gateway Connection
 *
 * Abstract base class providing common functionality for all gateway connection implementations.
 * Implements the IGatewayConnection interface and provides shared logic for connection lifecycle,
 * state management, statistics tracking, and event emission.
 *
 * Key Features:
 * - Connection state management with event emission
 * - Connection statistics and metrics tracking
 * - Abstract interface for protocol-specific implementations
 * - Error handling and cleanup
 * - Heartbeat and health monitoring support
 *
 * Connection States:
 * - DISCONNECTED: Not connected to gateway
 * - CONNECTING: Establishing connection
 * - CONNECTED: Successfully connected and operational
 * - RECONNECTING: Attempting to reconnect after failure
 * - ERROR: Connection failed with error condition
 *
 * Architecture:
 * - Extends EventEmitter for connection event broadcasting
 * - Implements IGatewayConnection for standardized interface
 * - Abstract methods for protocol-specific connection logic
 * - State machine pattern for connection lifecycle
 * - Statistics tracking for monitoring and debugging
 *
 * Statistics Tracked:
 * - Bytes sent/received for bandwidth monitoring
 * - Messages sent/received for protocol analysis
 * - Connection timestamps for uptime calculation
 * - Last activity timestamps for health monitoring
 *
 * Security Considerations:
 * - Secure connection establishment (TLS/SSL where applicable)
 * - Authentication and authorization
 * - Connection timeout handling
 * - Resource cleanup on disconnection
 */
export abstract class BaseConnection extends EventEmitter implements IGatewayConnection {
  // Current connection state in the state machine
  protected _state: GatewayConnectionState = GatewayConnectionState.DISCONNECTED;

  // Connection lifecycle timestamps
  protected connectedAt: Date | undefined;
  protected lastActivity: Date | undefined;

  // Statistics for monitoring and debugging
  protected bytesSent = 0;
  protected bytesReceived = 0;
  protected messagesSent = 0;
  protected messagesReceived = 0;

  // Unique identifier for the gateway this connection serves
  public abstract readonly gatewayId: string;

  /**
   * Get current connection state
   */
  public get state(): GatewayConnectionState {
    return this._state;
  }

  /**
   * Update connection state and emit events
   */
  protected setState(newState: GatewayConnectionState): void {
    const oldState = this._state;
    this._state = newState;

    if (newState !== oldState) {
      this.emit('stateChanged', { oldState, newState });

      // Update timestamps
      if (newState === GatewayConnectionState.CONNECTED) {
        this.connectedAt = new Date();
      }

      this.emit('stateChange', newState, oldState);
    }
  }

  /**
   * Abstract connect method - must be implemented by subclasses
   */
  public abstract connect(): Promise<void>;

  /**
   * Abstract disconnect method - must be implemented by subclasses
   */
  public abstract disconnect(): Promise<void>;

  /**
   * Abstract send method - must be implemented by subclasses
   */
  public abstract send(data: Buffer): Promise<void>;

  /**
   * Check if connection is active
   */
  public isConnected(): boolean {
    return this._state === GatewayConnectionState.CONNECTED;
  }

  /**
   * Update activity timestamp
   */
  protected updateActivity(): void {
    this.lastActivity = new Date();
  }

  /**
   * Record sent data
   */
  protected recordSent(bytes: number): void {
    this.bytesSent += bytes;
    this.messagesSent += 1;
    this.updateActivity();
  }

  /**
   * Record received data
   */
  protected recordReceived(bytes: number): void {
    this.bytesReceived += bytes;
    this.messagesReceived += 1;
    this.updateActivity();
  }

  /**
   * Get connection statistics
   */
  public getStats() {
    return {
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Handle connection errors
   */
  protected handleError(error: Error): void {
    this.setState(GatewayConnectionState.ERROR);
    this.emit('error', error);
  }

  /**
   * Handle incoming data
   */
  protected handleData(data: Buffer): void {
    this.recordReceived(data.length);
    this.emit('data', data);
  }

  /**
   * Handle connection close
   */
  protected handleClose(): void {
    this.setState(GatewayConnectionState.DISCONNECTED);
    this.emit('close');
  }
}
