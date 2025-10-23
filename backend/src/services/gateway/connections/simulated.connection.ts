import { BaseConnection } from './base.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';

/**
 * Simulated connection for testing and development
 * Provides realistic connection behavior without actual network calls
 */
export class SimulatedConnection extends BaseConnection {
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private responseTimer: NodeJS.Timeout | undefined;
  // private isSimulatingFailure = false; // Unused for now

  constructor(
    public readonly gatewayId: string,
    private readonly reliability: number = 0.95, // 95% success rate
    private readonly heartbeatInterval = 5000 // 5 seconds for testing
  ) {
    super();
  }

  /**
   * Simulate connection to gateway
   */
  public async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.setState(GatewayConnectionState.CONNECTING);

    // Simulate connection delay
    await this.simulateDelay(100, 500);

    // Simulate occasional connection failures
    if (Math.random() > this.reliability) {
      throw new Error('Simulated connection failure');
    }

    this.setState(GatewayConnectionState.CONNECTED);
    this.startHeartbeat();
  }

  /**
   * Simulate disconnection
   */
  public async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.clearResponseTimer();

    // Simulate disconnect delay
    await this.simulateDelay(50, 200);

    this.setState(GatewayConnectionState.DISCONNECTED);
  }

  /**
   * Simulate sending data
   */
  public async send(data: Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Connection not established');
    }

    // Simulate network delay
    await this.simulateDelay(10, 50);

    // Simulate occasional send failures
    if (Math.random() > this.reliability) {
      throw new Error('Simulated send failure');
    }

    this.recordSent(data.length);

    // Simulate response for certain message types
    this.simulateResponse(data);
  }

  /**
   * Start heartbeat simulation
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        // Simulate heartbeat
        this.emit('heartbeat');
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat simulation
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Clear response timer
   */
  private clearResponseTimer(): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = undefined;
    }
  }

  /**
   * Simulate network delay
   */
  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate gateway responses
   */
  private simulateResponse(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Simulate response delay
      this.responseTimer = setTimeout(() => {
        switch (message.type) {
          case 'ping':
            this.simulatePong(message);
            break;
          case 'device_status_request':
            this.simulateDeviceStatus(message);
            break;
          case 'device_command':
            this.simulateCommandResponse(message);
            break;
          case 'heartbeat':
            this.simulateHeartbeatResponse(message);
            break;
        }
      }, Math.random() * 100 + 50); // 50-150ms response time

    } catch (error) {
      // Ignore invalid messages in simulation
    }
  }

  /**
   * Simulate pong response
   */
  private simulatePong(originalMessage: any): void {
    const response = {
      id: `response-${Date.now()}`,
      type: 'pong',
      source: this.gatewayId,
      destination: originalMessage.source,
      protocolVersion: originalMessage.protocolVersion,
      timestamp: new Date().toISOString(),
      payload: {},
      correlationId: originalMessage.id,
    };

    const responseData = Buffer.from(JSON.stringify(response), 'utf8');
    this.handleData(responseData);
  }

  /**
   * Simulate device status response
   */
  private simulateDeviceStatus(originalMessage: any): void {
    const response = {
      id: `response-${Date.now()}`,
      type: 'device_status_response',
      source: this.gatewayId,
      destination: originalMessage.source,
      protocolVersion: originalMessage.protocolVersion,
      timestamp: new Date().toISOString(),
      payload: {
        devices: [
          {
            id: 'device-1',
            status: 'online',
            batteryLevel: 85,
            lastSeen: new Date().toISOString(),
          },
          {
            id: 'device-2',
            status: 'offline',
            lastSeen: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
          },
        ],
      },
      correlationId: originalMessage.id,
    };

    const responseData = Buffer.from(JSON.stringify(response), 'utf8');
    this.handleData(responseData);
  }

  /**
   * Simulate command response
   */
  private simulateCommandResponse(originalMessage: any): void {
    const response = {
      id: `response-${Date.now()}`,
      type: 'device_command_response',
      source: this.gatewayId,
      destination: originalMessage.source,
      protocolVersion: originalMessage.protocolVersion,
      timestamp: new Date().toISOString(),
      payload: {
        deviceId: originalMessage.payload.deviceId,
        command: originalMessage.payload.command,
        success: Math.random() > 0.1, // 90% success rate
        result: { executed: true },
      },
      correlationId: originalMessage.id,
    };

    const responseData = Buffer.from(JSON.stringify(response), 'utf8');
    this.handleData(responseData);
  }

  /**
   * Simulate heartbeat response
   */
  private simulateHeartbeatResponse(originalMessage: any): void {
    const response = {
      id: `response-${Date.now()}`,
      type: 'heartbeat',
      source: this.gatewayId,
      destination: originalMessage.source,
      protocolVersion: originalMessage.protocolVersion,
      timestamp: new Date().toISOString(),
      payload: {
        uptime: Math.floor(Math.random() * 86400), // Random uptime in seconds
        deviceCount: Math.floor(Math.random() * 50) + 10, // 10-60 devices
      },
      correlationId: originalMessage.id,
    };

    const responseData = Buffer.from(JSON.stringify(response), 'utf8');
    this.handleData(responseData);
  }
}
