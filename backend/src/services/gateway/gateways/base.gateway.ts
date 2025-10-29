import { EventEmitter } from 'events';
import {
  IGateway,
  IGatewayCapabilities,
  IGatewayStatus,
  IGatewayMessage,
  IDeviceInfo,
  IDeviceStatus,
  ICommandResult,
  GatewayConnectionState,
  MessageType,
  CommandPriority,
  ProtocolVersion
} from '../../../types/gateway.types';
import { IGatewayConnection } from '../../../types/gateway.types';
import { IProtocol } from '../../../types/gateway.types';
import { DeviceSyncService, GatewayDeviceData } from '../../device-sync.service';

/**
 * Base Gateway Implementation
 *
 * Abstract base class providing common functionality for all gateway implementations.
 * Implements the IGateway interface and provides shared logic for device management,
 * connection handling, and protocol abstraction.
 *
 * Key Features:
 * - Connection lifecycle management (connect/disconnect/reconnect)
 * - Device discovery and registration
 * - Command execution and response handling
 * - Heartbeat monitoring and health checks
 * - Protocol abstraction for different communication methods
 * - Event emission for status changes and device updates
 *
 * Connection States:
 * - DISCONNECTED: Not connected to gateway
 * - CONNECTING: Establishing connection
 * - CONNECTED: Successfully connected
 * - RECONNECTING: Attempting to reconnect after failure
 * - ERROR: Connection failed with error
 *
 * Device Management:
 * - Device discovery through sync operations
 * - Device registration and status tracking
 * - Command execution on individual devices
 * - Device lifecycle event emission
 *
 * Security Considerations:
 * - Secure connection establishment
 * - Authentication and authorization
 * - Command validation and sanitization
 * - Audit logging for all operations
 * - Error handling without information leakage
 */
export abstract class BaseGateway extends EventEmitter implements IGateway {
  // Connection and protocol components
  protected connection?: IGatewayConnection;
  protected protocol?: IProtocol;

  // Device registry - maps device IDs to device information
  protected devices = new Map<string, IDeviceInfo>();

  // Current gateway status
  protected _status: IGatewayStatus;

  // Timer handles for heartbeat and reconnection
  protected heartbeatTimer: NodeJS.Timeout | undefined;
  protected reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    public readonly id: string,
    public readonly facilityId: string,
    public readonly protocolVersion: ProtocolVersion = ProtocolVersion.V1_1,
    public readonly keyManagementVersion: 'v1' | 'v2' = 'v1'
  ) {
    super();

    this._status = {
      id: this.id,
      connectionState: GatewayConnectionState.DISCONNECTED,
      deviceCount: 0,
      version: '1.0.0',
      protocolVersion: this.protocolVersion,
    };
  }

  /**
   * Get gateway capabilities - must be implemented by subclasses
   */
  public abstract get capabilities(): IGatewayCapabilities;

  /**
   * Get current status
   */
  public get status(): IGatewayStatus {
    return { ...this._status };
  }

  /**
   * Initialize the gateway
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize protocol
      this.protocol = this.createProtocol();

      // Initialize connection
      this.connection = this.createConnection();

      // Set up event listeners
      this.setupEventListeners();

      this.emit('initialized');
    } catch (error) {
      this.handleError('Initialization failed', error as Error);
      throw error;
    }
  }

  /**
   * Shutdown the gateway
   */
  public async shutdown(): Promise<void> {
    try {
      this.stopHeartbeat();
      this.clearReconnectTimer();

      if (this.connection) {
        await this.connection.disconnect();
      }

      this.updateStatus({ connectionState: GatewayConnectionState.DISCONNECTED });
      this.emit('shutdown');
    } catch (error) {
      this.handleError('Shutdown failed', error as Error);
      throw error;
    }
  }

  /**
   * Connect to the gateway
   */
  public async connect(silent: boolean = false): Promise<void> {
    if (!this.connection) {
      throw new Error('Gateway not initialized');
    }

    try {
      this.updateStatus({ connectionState: GatewayConnectionState.CONNECTING });
      await this.connection.connect();
      this.updateStatus({ connectionState: GatewayConnectionState.CONNECTED });
      try {
        const { GatewayModel } = await import('@/models/gateway.model');
        const gatewayModel = new GatewayModel();
        await gatewayModel.updateStatusAndLastSeen(this.id, 'online');
        if (!silent) {
          const { WebSocketService } = await import('@/services/websocket.service');
          await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
        }
      } catch (_e) {}
      this.startHeartbeat();
      this.emit('connected');
    } catch (error) {
      this.updateStatus({
        connectionState: GatewayConnectionState.ERROR,
        errorMessage: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Disconnect from the gateway
   */
  public async disconnect(silent: boolean = false): Promise<void> {
    try {
      this.stopHeartbeat();
      this.clearReconnectTimer();

      if (this.connection) {
        await this.connection.disconnect();
      }

      this.updateStatus({ connectionState: GatewayConnectionState.DISCONNECTED });
      try {
        const { GatewayModel } = await import('@/models/gateway.model');
        const gatewayModel = new GatewayModel();
        await gatewayModel.updateStatus(this.id, 'offline');
        if (!silent) {
          const { WebSocketService } = await import('@/services/websocket.service');
          await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
        }
      } catch (_e) {}
      this.emit('disconnected');
    } catch (error) {
      this.handleError('Disconnect failed', error as Error);
      throw error;
    }
  }

  /**
   * Send a message to the gateway
   */
  public async sendMessage(message: IGatewayMessage): Promise<void> {
    if (!this.connection || !this.protocol) {
      throw new Error('Gateway not initialized');
    }

    if (!this.connection.isConnected()) {
      throw new Error('Gateway not connected');
    }

    try {
      // Validate message
      if (!this.protocol.validateMessage(message)) {
        throw new Error('Invalid message format');
      }

      // Encode message
      const data = this.protocol.encodeMessage(message);

      // Send data
      await this.connection.send(data);

      this.emit('messageSent', message);
    } catch (error) {
      this.handleError('Send message failed', error as Error);
      throw error;
    }
  }

  /**
   * Register a device with the gateway
   */
  public async registerDevice(deviceInfo: IDeviceInfo): Promise<void> {
    try {
      this.devices.set(deviceInfo.id, deviceInfo);
      this.updateDeviceCount();

      // Send registration message to gateway
      await this.sendDeviceRegistration(deviceInfo);

      this.emit('deviceRegistered', deviceInfo);
    } catch (error) {
      this.handleError('Device registration failed', error as Error);
      throw error;
    }
  }

  /**
   * Unregister a device from the gateway
   */
  public async unregisterDevice(deviceId: string): Promise<void> {
    try {
      const deviceInfo = this.devices.get(deviceId);
      if (!deviceInfo) {
        throw new Error(`Device ${deviceId} not found`);
      }

      this.devices.delete(deviceId);
      this.updateDeviceCount();

      // Send unregistration message to gateway
      await this.sendDeviceUnregistration(deviceId);

      this.emit('deviceUnregistered', deviceId);
    } catch (error) {
      this.handleError('Device unregistration failed', error as Error);
      throw error;
    }
  }

  /**
   * Get device status
   */
  public async getDeviceStatus(deviceId: string): Promise<IDeviceStatus> {
    try {
      const message: IGatewayMessage = {
        id: `status-${Date.now()}`,
        type: MessageType.DEVICE_STATUS_REQUEST,
        source: 'cloud',
        destination: this.id,
        protocolVersion: this.protocolVersion,
        timestamp: new Date(),
        payload: { deviceId },
        priority: CommandPriority.NORMAL,
      };

      // Send request and wait for response
      const response = await this.sendMessageAndWait(message, 5000);

      if (!response || !response.payload) {
        throw new Error('Invalid response format');
      }

      return response.payload as IDeviceStatus;
    } catch (error) {
      this.handleError('Get device status failed', error as Error);
      throw error;
    }
  }

  /**
   * Execute a command on a device
   */
  public async executeDeviceCommand(
    deviceId: string,
    command: string,
    params?: any
  ): Promise<ICommandResult> {
    try {
      const message: IGatewayMessage = {
        id: `cmd-${Date.now()}`,
        type: MessageType.DEVICE_COMMAND,
        source: 'cloud',
        destination: this.id,
        protocolVersion: this.protocolVersion,
        timestamp: new Date(),
        payload: { deviceId, command, params },
        priority: CommandPriority.NORMAL,
      };

      // Send command and wait for response
      const response = await this.sendMessageAndWait(message, 10000);

      if (!response || !response.payload) {
        return {
          success: false,
          error: 'Invalid response format',
          executedAt: new Date(),
          duration: 0,
        };
      }

      return response.payload as ICommandResult;
    } catch (error) {
      this.handleError('Execute device command failed', error as Error);
      throw error;
    }
  }

  /**
   * Abstract methods that must be implemented by subclasses
   */
  protected abstract createProtocol(): IProtocol;
  protected abstract createConnection(): IGatewayConnection;
  protected abstract sendDeviceRegistration(deviceInfo: IDeviceInfo): Promise<void>;
  protected abstract sendDeviceUnregistration(deviceId: string): Promise<void>;

  /**
   * Send message and wait for response
   */
  protected async sendMessageAndWait(
    message: IGatewayMessage,
    timeout: number
  ): Promise<IGatewayMessage | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('messageReceived', messageHandler);
        reject(new Error(`Response timeout after ${timeout}ms`));
      }, timeout);

      const messageHandler = (response: IGatewayMessage) => {
        if (response.correlationId === message.id) {
          clearTimeout(timeoutId);
          this.removeListener('messageReceived', messageHandler);
          resolve(response);
        }
      };

      this.on('messageReceived', messageHandler);

      this.sendMessage(message).catch(error => {
        clearTimeout(timeoutId);
        this.removeListener('messageReceived', messageHandler);
        reject(error);
      });
    });
  }

  /**
   * Set up event listeners for the connection
   */
  protected setupEventListeners(): void {
    if (!this.connection) return;

    this.connection.on('data', (data: Buffer) => {
      this.handleIncomingData(data);
    });

    this.connection.on('error', (error: Error) => {
      this.handleConnectionError(error);
    });

    this.connection.on('close', () => {
      this.handleConnectionClose();
    });

    this.connection.on('stateChanged', ({ newState }) => {
      this.updateStatus({ connectionState: newState });
    });
  }

  /**
   * Handle incoming data from the gateway
   */
  protected async handleIncomingData(data: Buffer): Promise<void> {
    try {
      if (!this.protocol) {
        throw new Error('Protocol not initialized');
      }

      const message = this.protocol.decodeMessage(data);
      this.emit('messageReceived', message);

      // Handle different message types
      await this.handleMessage(message);
    } catch (error) {
      this.handleError('Failed to handle incoming data', error as Error);
    }
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: IGatewayMessage): Promise<void> {
    switch (message.type) {
      case MessageType.HEARTBEAT:
        await this.handleHeartbeat(message);
        break;
      case MessageType.ERROR:
        this.handleGatewayError(message);
        break;
      default:
        this.emit('message', message);
    }
  }

  /**
   * Handle heartbeat messages
   */
  protected async handleHeartbeat(message: IGatewayMessage): Promise<void> {
    // Update last seen timestamp
    this.updateStatus({
      lastHeartbeat: new Date(),
      uptime: message.payload?.uptime,
      memoryUsage: message.payload?.memoryUsage,
      cpuUsage: message.payload?.cpuUsage,
    });
    try {
      const { GatewayModel } = await import('@/models/gateway.model');
      const gatewayModel = new GatewayModel();
      await gatewayModel.updateStatusAndLastSeen(this.id, 'online');
      const { WebSocketService } = await import('@/services/websocket.service');
      await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
    } catch (_e) {}

    // Send heartbeat response
    const response: IGatewayMessage = {
      id: `heartbeat-${Date.now()}`,
      type: MessageType.HEARTBEAT,
      source: 'cloud',
      destination: this.id,
      protocolVersion: this.protocolVersion,
      timestamp: new Date(),
      payload: {},
      priority: CommandPriority.LOW,
      correlationId: message.id,
    };

    await this.sendMessage(response);
  }

  /**
   * Handle gateway errors
   */
  protected handleGatewayError(message: IGatewayMessage): void {
    this.updateStatus({
      connectionState: GatewayConnectionState.ERROR,
      errorMessage: message.payload?.error || 'Gateway reported an error'
    });
    this.emit('gatewayError', message.payload);
  }

  /**
   * Handle connection errors
   */
  protected handleConnectionError(error: Error): void {
    this.updateStatus({
      connectionState: GatewayConnectionState.ERROR,
      errorMessage: error.message
    });
    (async () => {
      try {
        const { GatewayModel } = await import('@/models/gateway.model');
        const gatewayModel = new GatewayModel();
        await gatewayModel.updateStatus(this.id, 'error');
        const { WebSocketService } = await import('@/services/websocket.service');
        await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
      } catch (_e) {}
    })();
    this.emit('connectionError', error);
  }

  /**
   * Handle connection close
   */
  protected handleConnectionClose(): void {
    this.stopHeartbeat();
    this.updateStatus({ connectionState: GatewayConnectionState.DISCONNECTED });
    (async () => {
      try {
        const { GatewayModel } = await import('@/models/gateway.model');
        const gatewayModel = new GatewayModel();
        await gatewayModel.updateStatus(this.id, 'offline');
        const { WebSocketService } = await import('@/services/websocket.service');
        await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
      } catch (_e) {}
    })();
    this.emit('connectionClosed');
  }

  /**
   * Handle general errors
   */
  protected handleError(context: string, error: Error): void {
    console.error(`${context}:`, error);
    this.emit('error', error);
  }

  /**
   * Update gateway status
   */
  protected updateStatus(updates: Partial<IGatewayStatus>): void {
    this._status = { ...this._status, ...updates };
    this.emit('statusChanged', this.status);
  }

  /**
   * Update device count
   */
  protected updateDeviceCount(): void {
    this.updateStatus({ deviceCount: this.devices.size });
  }

  /**
   * Start heartbeat monitoring
   */
  protected startHeartbeat(): void {
    const interval = this.capabilities.heartbeatInterval || 30000;
    this.heartbeatTimer = setInterval(() => {
      if (this.connection?.isConnected()) {
        this.sendHeartbeat();
      }
    }, interval);
  }

  /**
   * Stop heartbeat monitoring
   */
  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Send heartbeat message
   */
  protected async sendHeartbeat(): Promise<void> {
    try {
      const message: IGatewayMessage = {
        id: `heartbeat-${Date.now()}`,
        type: MessageType.HEARTBEAT,
        source: 'cloud',
        destination: this.id,
        protocolVersion: this.protocolVersion,
        timestamp: new Date(),
        payload: {},
        priority: CommandPriority.LOW,
      };

      await this.sendMessage(message);
    } catch (error) {
      this.handleError('Heartbeat failed', error as Error);
    }
  }

  /**
   * Clear reconnection timer
   */
  protected clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Sync gateway device data with the backend database.
   * This method should be called whenever the gateway receives new device information
   * (either from polling or push events).
   */
  protected async syncDeviceData(gatewayDevices: GatewayDeviceData[]): Promise<void> {
    const deviceSyncService = DeviceSyncService.getInstance();

    try {
      // Sync device inventory (add new, remove missing)
      await deviceSyncService.syncGatewayDevices(this.id, gatewayDevices);
    } catch (error) {
      console.error(`Failed to sync device inventory for gateway ${this.id}:`, error);
    }

    try {
      // Update device statuses
      await deviceSyncService.updateDeviceStatuses(this.id, gatewayDevices);
    } catch (error) {
      console.error(`Failed to update device statuses for gateway ${this.id}:`, error);
    }
  }

  /**
   * Perform device synchronization.
   * This fetches all devices from the gateway and syncs them with the backend.
   * Default implementation should be overridden by concrete gateway classes.
   */
  public async sync(_updateStatus?: boolean): Promise<{
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  }> {
    throw new Error('sync() method must be implemented by concrete gateway classes');
  }
}
