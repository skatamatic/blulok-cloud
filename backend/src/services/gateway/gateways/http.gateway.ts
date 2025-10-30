import { BaseGateway } from './base.gateway';
import {
  IGatewayCapabilities,
  IDeviceInfo,
  DeviceType,
  ProtocolVersion,
  ICommandResult,
  IProtocol,
  IGatewayConnection,
  IDeviceStatus,
  DeviceConnectionState
} from '../../../types/gateway.types';
import { HttpConnection } from '../connections/http.connection';
import { ProtocolFactory } from '../protocols/protocol-factory';
import { GatewayDeviceData } from '../../device-sync.service';

/**
 * HTTP Gateway Implementation
 *
 * HTTP-based gateway implementation for cloud-managed facilities using REST API communication.
 * Designed for polling-based architectures where gateways periodically check for updates
 * rather than maintaining persistent connections.
 *
 * Key Features:
 * - REST API communication with configurable polling intervals
 * - API key authentication for secure communication
 * - Automatic device discovery and synchronization
 * - Command queuing and execution through HTTP endpoints
 * - Failure detection and offline status management
 * - SSL certificate validation control for development
 *
 * Polling Architecture:
 * - Configurable poll frequency (default 30 seconds)
 * - Device status synchronization on each poll
 * - Command delivery and response collection
 * - Automatic retry logic for failed operations
 * - Consecutive failure tracking for health monitoring
 *
 * Device Management:
 * - HTTP-based device discovery and registration
 * - Status polling for connected devices
 * - Command execution through API calls
 * - Battery level and connectivity monitoring
 *
 * Security Considerations:
 * - HTTPS-only communication in production
 * - API key authentication and validation
 * - SSL certificate validation (configurable for development)
 * - Request/response encryption and integrity
 * - Audit logging for all API interactions
 */
export class HttpGateway extends BaseGateway {
  // HTTP connection for API communication
  private httpConnection?: HttpConnection;

  // Polling configuration and state
  private readonly pollFrequencyMs: number;
  private pollingInterval: NodeJS.Timeout | undefined;

  // Failure tracking for health monitoring
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES_BEFORE_OFFLINE = 3;

  constructor(
    id: string,
    facilityId: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.V1_1,
    pollFrequencyMs: number = 30000, // Default 30 seconds
    keyManagementVersion: 'v1' | 'v2' = 'v1',
    private readonly ignoreSslCert: boolean = false
  ) {
    super(id, facilityId, protocolVersion, keyManagementVersion);
    this.pollFrequencyMs = pollFrequencyMs;
  }

  /**
   * Get gateway capabilities
   */
  public get capabilities(): IGatewayCapabilities {
    return {
      supportedProtocols: [ProtocolVersion.V1_0, ProtocolVersion.V1_1],
      maxConnections: 1,
      supportedDeviceTypes: [
        DeviceType.LOCK,
        DeviceType.ACCESS_CONTROL,
      ],
      firmwareUpdateSupport: false, // Not implemented in HTTP API yet
      remoteAccessSupport: true,
      keyManagementSupport: true,
      heartbeatInterval: 60000, // 1 minute for HTTP polling
    };
  }

  /**
   * Create protocol instance
   */
  protected createProtocol(): IProtocol {
    return ProtocolFactory.createProtocol(this.protocolVersion);
  }

  /**
   * Create HTTP connection instance
   */
  protected createConnection(): IGatewayConnection {
    this.httpConnection = new HttpConnection(
      this.id,
      this.baseUrl,
      this.apiKey,
      this.ignoreSslCert
    );
    return this.httpConnection;
  }


  /**
   * Connect to the gateway and start polling
   */
  public override async connect(silent: boolean = false): Promise<void> {
    await super.connect(silent);
    this.startPolling();
  }

  /**
   * Disconnect from the gateway and stop polling
   */
  public override async disconnect(silent: boolean = false): Promise<void> {
    this.stopPolling();
    await super.disconnect(silent);
  }

  /**
   * Start polling for device status updates
   */
  private startPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollAndSyncDevices();
    }, this.pollFrequencyMs);

    console.log(`Started polling for gateway ${this.id} every ${this.pollFrequencyMs}ms`);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      console.log(`Stopped polling for gateway ${this.id}`);
    }
  }

  /**
   * Poll gateway and sync devices
   */
  private async pollAndSyncDevices(): Promise<void> {
    if (!this.httpConnection) {
      return;
    }

    // If we're offline and have too many failures, try to reconnect
    if (this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_OFFLINE) {
      try {
        console.log(`Attempting to reconnect gateway ${this.id}...`);
        await this.connect();
        this.consecutiveFailures = 0;
      } catch (reconnectError) {
        console.error(`Failed to reconnect gateway ${this.id}:`, reconnectError);
        return; // Skip this poll cycle
      }
    }

    try {
      // Use the sync method for consistency
      await this.sync();
      this.consecutiveFailures = 0; // Reset on success

      // For automatic polling, don't update status - only manual syncs should change status
      // This prevents the status from flipping between online/offline during polling
      console.log(`[HTTP-GATEWAY] Polling sync successful for gateway ${this.id}`);
    } catch (error) {
      this.consecutiveFailures++;
      console.error(`Failed to poll gateway ${this.id} (${this.consecutiveFailures}/${this.MAX_FAILURES_BEFORE_OFFLINE}):`, error);

      // For automatic polling, don't update status - only critical manual sync failures should
      // This keeps the status stable and only changes it when explicitly requested
    }
  }

  /**
   * Get device status from the gateway API
   */
  public override async getDeviceStatus(deviceId: string): Promise<IDeviceStatus> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      // Use the get-lock-state endpoint for locks
      const lockState = await this.httpConnection.makeRequest(
        'GET',
        '/keys/get-lock-state',
        undefined,
        { lockId: deviceId }
      );

      return {
        id: deviceId,
        connectionState: DeviceConnectionState.ONLINE,
        isLocked: lockState.locked,
        batteryLevel: lockState.batteryLevel,
        signalStrength: lockState.signalStrength,
        temperature: lockState.temperature,
        lastActivity: new Date(),
        hasError: false,
      };
    } catch (error: any) {
      return {
        id: deviceId,
        connectionState: DeviceConnectionState.ERROR,
        hasError: true,
        errorMessage: `Failed to get device status: ${error.message || error}`,
        lastActivity: new Date(),
      };
    }
  }

  /**
   * Execute device command via the gateway API
   */
  public override async executeDeviceCommand(
    deviceId: string,
    command: string,
    _params?: any
  ): Promise<ICommandResult> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      // Map our command to the API format
      let apiCommand: string;
      switch (command.toUpperCase()) {
        case 'LOCK':
        case 'CLOSE':
          apiCommand = 'CLOSE';
          break;
        case 'UNLOCK':
        case 'OPEN':
          apiCommand = 'OPEN';
          break;
        default:
          throw new Error(`Unsupported command: ${command}`);
      }

      const startTime = Date.now();

      await this.httpConnection.makeRequest(
        'POST',
        '/locks/send-lock-command',
        {
          lockId: deviceId,
          command: apiCommand,
        }
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        executedAt: new Date(),
        duration,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Command execution failed',
        executedAt: new Date(),
        duration: 0,
      };
    }
  }

  /**
   * Send device registration (not directly supported in current API)
   */
  protected async sendDeviceRegistration(deviceInfo: IDeviceInfo): Promise<void> {
    // The current HTTP API doesn't have explicit device registration
    // Devices are registered when keys are added
    console.log(`[HTTP-GATEWAY] Device ${deviceInfo.id} registered (via key management)`);
  }

  /**
   * Send device unregistration (not directly supported in current API)
   */
  protected async sendDeviceUnregistration(deviceId: string): Promise<void> {
    // The current HTTP API doesn't have explicit device unregistration
    // Devices are unregistered when all keys are revoked
    console.log(`[HTTP-GATEWAY] Device ${deviceId} unregistered`);
  }

  /**
   * Add access key to device
   */
  public async addKey(deviceId: string, keyData: any): Promise<ICommandResult> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const startTime = Date.now();

      // Prepare request payload based on key management version
      let payload: any;

      if (this.keyManagementVersion === 'v2') {
        // ED25519 format - expect direct fields; fallback to legacy mapping
        payload = {
          lockId: deviceId,
          public_key: keyData.public_key || keyData.key_secret,
          user_id: keyData.user_id || keyData.key_token,
        };
      } else {
        // v1 (Postman) format - hex-encoded keys
        payload = {
          lockId: deviceId,
          revision: keyData.revision ?? 0,
          key_code: keyData.key_code ?? 0,
          key_counter: keyData.key_counter ?? 0,
          key_secret: keyData.key_secret,
          key_token: keyData.key_token,
        };
      }

      const resp = await this.httpConnection.makeRequest('POST', '/keys/add-key', payload);

      const duration = Date.now() - startTime;

      // Try to extract keyCode for v1
      let keyCode: number | undefined;
      if (this.keyManagementVersion === 'v1') {
        const candidates = [
          resp?.keyCode,
          resp?.key_code,
          resp?.data?.keyCode,
          resp?.data?.key_code,
        ];
        keyCode = candidates.find((v: any) => typeof v === 'number');
      }

      return {
        success: true,
        data: keyCode !== undefined ? { keyCode } : undefined,
        executedAt: new Date(),
        duration,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to add key',
        executedAt: new Date(),
        duration: 0,
      };
    }
  }

  /**
   * Revoke access key from device
   */
  public async revokeKey(deviceId: string, keyCode: number, publicKey?: string): Promise<ICommandResult> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const startTime = Date.now();

      // Prepare request based on key management version
      let queryParams: any;

      if (this.keyManagementVersion === 'v2' && publicKey) {
        // ED25519 format - use public key for revocation
        queryParams = {
          lockId: deviceId,
          public_key: publicKey, // ED25519 public key (base64)
        };
      } else {
        // v1 (Postman) format - use keyCode
        queryParams = {
          lockId: deviceId,
          keyCode: keyCode.toString(),
        };
      }

      await this.httpConnection.makeRequest('DELETE', '/keys/revoke-key', undefined, queryParams);

      const duration = Date.now() - startTime;

      return {
        success: true,
        executedAt: new Date(),
        duration,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to revoke key',
        executedAt: new Date(),
        duration: 0,
      };
    }
  }

  /**
   * Get keys for device
   */
  public async getKeys(deviceId: string): Promise<any[]> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const response = await this.httpConnection.makeRequest(
        'GET',
        '/keys/get-keys',
        undefined,
        { lockId: deviceId }
      );

      // Check if response is HTML (indicates wrong endpoint)
      if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
        throw new Error('Received HTML response instead of JSON for key retrieval. API endpoint may not exist.');
      }

      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      } else if (response && typeof response === 'object') {
        // Check common response wrapper formats
        if (response.data && Array.isArray(response.data)) {
          return response.data;
        }
        if (response.keys && Array.isArray(response.keys)) {
          return response.keys;
        }
        // If it's an object but we can't find an array, throw error
        throw new Error(`Unexpected response format from /keys/get-keys: ${JSON.stringify(response).substring(0, 200)}`);
      } else {
        // Response is not an object or array
        throw new Error(`Invalid response type from /keys/get-keys: ${typeof response}`);
      }
    } catch (error: any) {
      console.error(`Failed to get keys for device ${deviceId}:`, error);

      // Provide more specific error messages for common issues
      if (error?.response?.status === 404) {
        throw new Error(`Key retrieval endpoint not found. The gateway may not support key management or the device ID ${deviceId} is invalid.`);
      } else if (error?.response?.status === 401) {
        throw new Error(`Authentication failed when retrieving keys. Please check the API key configured for this gateway.`);
      } else if (error?.response?.status >= 500) {
        throw new Error(`Gateway server error (${error.response.status}) when retrieving keys. The gateway may be experiencing issues.`);
      }

      throw error; // Re-throw other errors
    }
  }

  /**
   * Get all locks/devices
   */
  public async getAllLocks(): Promise<any[]> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const response = await this.httpConnection.makeRequest('GET', '/locks/all');

      // Check if response is HTML (indicates wrong endpoint)
      if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
        throw new Error('Received HTML response instead of JSON. The gateway URL may point to a web interface instead of an API endpoint.');
      }

      // Check if response indicates API not found
      if (response && typeof response === 'object' && response.status === 404) {
        throw new Error(`API endpoint not found. The gateway at ${this.baseUrl} does not support the expected API endpoints. Please check that the gateway firmware supports the Mesh Manager API.`);
      }

      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      } else if (response && typeof response === 'object') {
        // Check common response wrapper formats
        if (response.data && Array.isArray(response.data)) {
          return response.data;
        }
        if (response.locks && Array.isArray(response.locks)) {
          return response.locks;
        }
        if (response.devices && Array.isArray(response.devices)) {
          return response.devices;
        }
        // If it's an object but we can't find an array, throw error
        throw new Error(`Unexpected response format from /locks/all: ${JSON.stringify(response).substring(0, 200)}`);
      } else {
        // Response is not an object or array
        throw new Error(`Invalid response type from /locks/all: ${typeof response}`);
      }
    } catch (error: any) {
      console.error('Failed to get all locks:', error);

      // Provide more specific error messages for common issues
      if (error?.response?.status === 404) {
        throw new Error(`API endpoint not found. The gateway at ${this.baseUrl} does not support the expected API endpoints (/locks/all). Please check that the gateway firmware supports the Mesh Manager API.`);
      } else if (error?.response?.status === 401) {
        throw new Error(`Authentication failed. Please check the API key configured for this gateway.`);
      } else if (error?.response?.status >= 500) {
        throw new Error(`Gateway server error (${error.response.status}). The gateway may be experiencing issues.`);
      } else if (error?.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to gateway at ${this.baseUrl}. Please check the gateway URL and network connectivity.`);
      }

      throw error; // Re-throw other errors
    }
  }

  /**
   * Perform device synchronization for HTTP gateway
   */
  public override async sync(updateStatus: boolean = false): Promise<{
    devices: any[];
    syncResults: {
      devicesFound: number;
      devicesSynced: number;
      keysRetrieved: number;
      errors: string[];
    };
  }> {
    const syncResults = {
      devicesFound: 0,
      devicesSynced: 0,
      keysRetrieved: 0,
      errors: [] as string[]
    };

    try {
      console.log(`[HTTP-GATEWAY] Performing sync for gateway ${this.id}`);

      // Get all locks from the gateway
      let gatewayLocks: any[] = [];
      try {
        gatewayLocks = await this.getAllLocks();
        syncResults.devicesFound = gatewayLocks.length;
      } catch (error: any) {
        const errorMessage = `Failed to get device list: ${error}`;
        syncResults.errors.push(errorMessage);
        console.error(`[HTTP-GATEWAY] Sync failed for gateway ${this.id}:`, error);

        // Check if this is a critical configuration error that should mark gateway offline
        const isCriticalError = error?.message?.includes('API endpoint not found') ||
                               error?.message?.includes('Cannot connect to gateway') ||
                               error?.message?.includes('Authentication failed');

        if (isCriticalError && updateStatus) {
          // For critical errors in manual syncs, mark gateway offline immediately
          try {
            const { GatewayModel } = await import('@/models/gateway.model');
            const gatewayModel = new GatewayModel();
            await gatewayModel.updateStatus(this.id, 'offline');
            const { WebSocketService } = await import('@/services/websocket.service');
            await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
          } catch (_e) {}

          throw new Error(errorMessage); // Re-throw to mark sync as failed
        }

        // For non-critical errors, return partial results
        return {
          devices: [],
          syncResults
        };
      }

      // Convert gateway locks to GatewayDeviceData format
      const gatewayDevices: GatewayDeviceData[] = gatewayLocks.map(lock => ({
        id: lock.id || lock.lockId || lock.serial,
        lockId: lock.lockId,
        serial: lock.serial || lock.id || lock.lockId,
        online: lock.online !== false, // Default to true if not specified
        locked: lock.locked,
        batteryLevel: lock.batteryLevel,
        signalStrength: lock.signalStrength,
        temperature: lock.temperature,
        firmwareVersion: lock.firmwareVersion,
        lastSeen: new Date()
      }));

      // Sync with backend using the base gateway method
      await this.syncDeviceData(gatewayDevices);
      syncResults.devicesSynced = gatewayDevices.length;

      // Get keys for each device
      const devicesWithKeys = [];
      for (const device of gatewayLocks) {
        const deviceId = device.id || device.lockId || device.serial;
        try {
          const keys = await this.getKeys(deviceId);
          syncResults.keysRetrieved += keys.length;

          devicesWithKeys.push({
            id: deviceId,
            lockId: device.lockId,
            serial: device.serial || device.id || device.lockId,
            online: device.online !== false,
            locked: device.locked,
            batteryLevel: device.batteryLevel,
            signalStrength: device.signalStrength,
            temperature: device.temperature,
            firmwareVersion: device.firmwareVersion,
            keys: keys || []
          });
        } catch (error) {
          console.warn(`Failed to get keys for device ${deviceId}:`, error);
          syncResults.errors.push(`Failed to get keys for device ${deviceId}: ${error}`);
          devicesWithKeys.push({
            id: device.id || device.lockId || device.serial,
            lockId: device.lockId,
            serial: device.serial || device.id || device.lockId,
            online: device.online !== false,
            locked: device.locked,
            batteryLevel: device.batteryLevel,
            signalStrength: device.signalStrength,
            temperature: device.temperature,
            firmwareVersion: device.firmwareVersion,
            keys: []
          });
        }
      }

      console.log(`[HTTP-GATEWAY] Sync completed for gateway ${this.id}`);

      // For manual syncs, update status to online if sync succeeded
      if (updateStatus && syncResults.errors.length === 0) {
        try {
          const { GatewayModel } = await import('@/models/gateway.model');
          const gatewayModel = new GatewayModel();
          await gatewayModel.updateStatusAndLastSeen(this.id, 'online');
          const { WebSocketService } = await import('@/services/websocket.service');
          await WebSocketService.getInstance().broadcastGatewayStatusUpdate(this.facilityId, this.id);
        } catch (_e) {}
      }

      return {
        devices: devicesWithKeys,
        syncResults
      };
    } catch (error) {
      console.error(`Failed to sync for gateway ${this.id}:`, error);
      syncResults.errors.push(`Sync failed: ${error}`);
      throw error;
    }
  }

  /**
   * Send FCM message (for push notifications to mobile devices)
   */
  public async sendFCMMessage(token: string, _data: any): Promise<ICommandResult> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const startTime = Date.now();

      // FCM is handled externally, but we can log it for now
      console.log(`[HTTP-GATEWAY] Sending FCM message to token: ${token.substring(0, 20)}...`);

      // In a real implementation, this would make an HTTP call to FCM
      // For now, we'll simulate success
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

      const duration = Date.now() - startTime;

      return {
        success: true,
        executedAt: new Date(),
        duration,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send FCM message',
        executedAt: new Date(),
        duration: 0,
      };
    }
  }

  /**
   * Get gateway IP address
   */
  public async getGatewayIP(): Promise<string | null> {
    if (!this.httpConnection) {
      throw new Error('Gateway not connected');
    }

    try {
      const response = await this.httpConnection.makeRequest('GET', '/devices/get-ip');
      return response?.ip || null;
    } catch (error: any) {
      console.error('Failed to get gateway IP:', error);
      return null;
    }
  }
}
