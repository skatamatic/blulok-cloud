import { EventEmitter } from 'events';
import { IGateway, IDeviceInfo, IDeviceStatus, ICommandResult, ProtocolVersion } from '../../types/gateway.types';
import { GatewayModel, Gateway } from '../../models/gateway.model';
import { GatewayFactory } from './gateways/gateway-factory';
import { DatabaseService } from '@/services/database.service';

/**
 * Gateway Service - Manages gateway instances and provides high-level API
 */
export class GatewayService extends EventEmitter {
  private static instance: GatewayService;
  private activeGateways = new Map<string, IGateway>();
  private gatewayModel = new GatewayModel();
  private db = DatabaseService.getInstance().connection;

  private constructor() {
    super();
  }

  public static getInstance(): GatewayService {
    if (!GatewayService.instance) {
      GatewayService.instance = new GatewayService();
    }
    return GatewayService.instance;
  }

  /**
   * Initialize all configured gateways
   */
  public async initializeAllGateways(): Promise<void> {
    try {
      const gateways = await this.gatewayModel.findAll();

      for (const gatewayConfig of gateways) {
        try {
          await this.initializeGateway(gatewayConfig);
        } catch (error) {
          console.error(`Failed to initialize gateway ${gatewayConfig.id}:`, error);
        }
      }

      console.log(`Initialized ${this.activeGateways.size} gateways`);
    } catch (error) {
      console.error('Failed to initialize gateways:', error);
      throw error;
    }
  }

  /**
   * Initialize a specific gateway
   */
  public async initializeGateway(gatewayConfig: Gateway): Promise<IGateway> {
    try {
      // Create gateway instance
      const gateway = GatewayFactory.createFromConfig({
        id: gatewayConfig.id,
        facilityId: gatewayConfig.facility_id,
        type: gatewayConfig.gateway_type || 'simulated',
        keyManagementVersion: gatewayConfig.key_management_version,
        ...(gatewayConfig.connection_url && { connectionUrl: gatewayConfig.connection_url }),
        ...(gatewayConfig.base_url && { baseUrl: gatewayConfig.base_url }),
        ...(gatewayConfig.api_key && { apiKey: gatewayConfig.api_key }),
        ...(gatewayConfig.protocol_version && { protocolVersion: gatewayConfig.protocol_version as ProtocolVersion }),
        ...(gatewayConfig.poll_frequency_ms && { poll_frequency_ms: gatewayConfig.poll_frequency_ms }),
        ...(gatewayConfig.ignore_ssl_cert !== undefined && { ignore_ssl_cert: gatewayConfig.ignore_ssl_cert }),
      });

      // Initialize the gateway
      await gateway.initialize();

      // Store the active gateway
      this.activeGateways.set(gatewayConfig.id, gateway);

      // Set up event listeners
      this.setupGatewayEventListeners(gateway);

      console.log(`Gateway ${gatewayConfig.id} initialized successfully`);
      
      // Auto-connect after initialization
      try {
        await gateway.connect();
        console.log(`Gateway ${gatewayConfig.id} connected and polling started`);
      } catch (connectError) {
        console.error(`Failed to connect gateway ${gatewayConfig.id} after initialization:`, connectError);
        // Don't throw - gateway is initialized, connection will retry on next poll
      }
      
      return gateway;
    } catch (error) {
      console.error(`Failed to initialize gateway ${gatewayConfig.id}:`, error);
      throw error;
    }
  }

  /**
   * Reinitialize a gateway with updated configuration
   * This removes the existing gateway from cache and creates a new one
   */
  public async reinitializeGateway(gatewayConfig: Gateway): Promise<IGateway> {
    try {
      // Disconnect and remove existing gateway if it exists
      const existingGateway = this.activeGateways.get(gatewayConfig.id);
      if (existingGateway) {
        try {
          await existingGateway.disconnect();
        } catch (disconnectError) {
          console.warn(`Failed to disconnect existing gateway ${gatewayConfig.id} during reinitialization:`, disconnectError);
        }
        this.activeGateways.delete(gatewayConfig.id);
      }

      // Initialize with new configuration
      return await this.initializeGateway(gatewayConfig);
    } catch (error) {
      console.error(`Failed to reinitialize gateway ${gatewayConfig.id}:`, error);
      throw error;
    }
  }

  /**
   * Connect to a gateway
   */
  public async connectGateway(gatewayId: string): Promise<void> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    await gateway.connect();
  }

  /**
   * Disconnect from a gateway
   */
  public async disconnectGateway(gatewayId: string): Promise<void> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    await gateway.disconnect();
  }

  /**
   * Get gateway instance
   */
  public getGateway(gatewayId: string): IGateway | undefined {
    return this.activeGateways.get(gatewayId);
  }

  /**
   * Get all active gateways
   */
  public getAllGateways(): IGateway[] {
    return Array.from(this.activeGateways.values());
  }

  /**
   * Get gateways for a specific facility
   */
  public getGatewaysByFacility(facilityId: string): IGateway[] {
    return this.getAllGateways().filter(gateway => gateway.facilityId === facilityId);
  }

  /**
   * Register device with gateway
   */
  public async registerDevice(gatewayId: string, deviceInfo: IDeviceInfo): Promise<void> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    await gateway.registerDevice(deviceInfo);
  }

  /**
   * Unregister device from gateway
   */
  public async unregisterDevice(gatewayId: string, deviceId: string): Promise<void> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    await gateway.unregisterDevice(deviceId);
  }

  /**
   * Get device status
   */
  public async getDeviceStatus(gatewayId: string, deviceId: string): Promise<IDeviceStatus> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    return await gateway.getDeviceStatus(deviceId);
  }

  /**
   * Execute device command
   */
  public async executeDeviceCommand(
    gatewayId: string,
    deviceId: string,
    command: string,
    params?: any
  ): Promise<ICommandResult> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    return await gateway.executeDeviceCommand(deviceId, command, params);
  }

  /**
   * Add access key to device
   */
  public async addKey(
    gatewayId: string,
    deviceId: string,
    keyData: {
      revision: number;
      key_code: number;
      key_counter: number;
      key_secret: string;
      key_token: string;
    }
  ): Promise<ICommandResult> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    // Check if gateway supports key management
    if (!gateway.capabilities.keyManagementSupport) {
      throw new Error(`Gateway ${gatewayId} does not support key management`);
    }

    // Use gateway specific method if available
    if (gateway.addKey) {
      return await gateway.addKey(deviceId, keyData);
    }

    throw new Error(`Key management not implemented for gateway type`);
  }

  /**
   * Revoke access key from device
   */
  public async revokeKey(gatewayId: string, deviceId: string, keyCode: number): Promise<ICommandResult> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    // Check if gateway supports key management
    if (!gateway.capabilities.keyManagementSupport) {
      throw new Error(`Gateway ${gatewayId} does not support key management`);
    }

    // Use gateway specific method if available
    if (gateway.revokeKey) {
      return await gateway.revokeKey(deviceId, keyCode);
    }

    throw new Error(`Key management not implemented for gateway type`);
  }

  /**
   * Get keys for device
   */
  public async getKeys(gatewayId: string, deviceId: string): Promise<any[]> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    // Use gateway specific method if available
    if (gateway.getKeys) {
      return await gateway.getKeys(deviceId);
    }

    return [];
  }

  /**
   * Resolve gatewayId for a given lock (blulok device id)
   */
  private async getGatewayIdForLock(lockId: string, expectedGatewayId?: string): Promise<string> {
    const row = await this.db('blulok_devices').where({ id: lockId }).select('gateway_id').first();
    if (!row?.gateway_id) throw new Error(`Gateway not found for lock ${lockId}`);

    const actualGatewayId = row.gateway_id as string;

    // Validate gateway hasn't changed (lock moved to different gateway)
    if (expectedGatewayId && actualGatewayId !== expectedGatewayId) {
      throw new Error(`Lock ${lockId} gateway changed from ${expectedGatewayId} to ${actualGatewayId}`);
    }

    return actualGatewayId;
  }

  /**
   * Add a user public key to a lock (by lockId)
   *
   * NOTE: This is a placeholder implementation. The gateway API expects specific
   * key_secret and key_token formats (hex-encoded), but we don't yet know how
   * to derive these from the ED25519 public key. This needs to be resolved with
   * the gateway protocol specification.
   */
  public async addKeyToLock(lockId: string, publicKey: string, userId: string, expectedGatewayId?: string): Promise<void> {
    const gatewayId = await this.getGatewayIdForLock(lockId, expectedGatewayId);
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) throw new Error(`Gateway ${gatewayId} not found`);
    if (!gateway.capabilities.keyManagementSupport || !gateway.addKey) {
      throw new Error(`Gateway ${gatewayId} does not support key management`);
    }

    let result: any;
    if (gateway.keyManagementVersion === 'v2') {
      // v2: send public key + user id
      result = await gateway.addKey(lockId, {
        public_key: publicKey,
        user_id: userId,
      });
    } else {
      // v1: delegate hex fields mapping to caller; here we don't possess them – not supported in this path
      // For v1, callers should use addKey(gatewayId, deviceId, hex payload). This method is designed for v2.
      throw new Error('addKeyToLock only supports v2 gateways when called with publicKey');
    }

    if (!result.success) {
      throw new Error(`Failed to add key: ${result.error}`);
    }

    // Persist key_code if returned (v1 only – not applicable here)
  }

  /**
   * Remove a user public key from a lock (by lockId)
   *
   * NOTE: This is a placeholder implementation. The gateway API expects the
   * keyCode that was originally assigned during add-key, but we don't track
   * this yet. This needs to be stored in device_key_distributions.key_code
   * and retrieved during revocation.
   */
  public async removeKeyFromLock(lockId: string, publicKey: string, userId: string, expectedGatewayId?: string): Promise<void> {
    const gatewayId = await this.getGatewayIdForLock(lockId, expectedGatewayId);
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) throw new Error(`Gateway ${gatewayId} not found`);
    if (!gateway.capabilities.keyManagementSupport || !gateway.revokeKey) {
      throw new Error(`Gateway ${gatewayId} does not support key management`);
    }

    let result: any;
    if (gateway.keyManagementVersion === 'v2') {
      // Revoke by public key
      result = await gateway.revokeKey(lockId, 0, publicKey);
    } else {
      // v1: need the stored key_code
      const db = (await import('@/services/database.service')).DatabaseService.getInstance().connection;
      const row = await db('device_key_distributions')
        .where({ target_type: 'blulok', target_id: lockId })
        .join('user_devices as ud', 'ud.id', 'device_key_distributions.user_device_id')
        .where('ud.user_id', userId)
        .whereIn('device_key_distributions.status', ['added', 'pending_remove'])
        .select('device_key_distributions.key_code')
        .first();
      const keyCode: number | undefined = row?.key_code;
      if (typeof keyCode !== 'number') {
        throw new Error('Missing key_code for v1 key revocation');
      }
      result = await gateway.revokeKey(lockId, keyCode);
    }
    if (!result.success) {
      throw new Error(`Failed to remove key: ${result.error}`);
    }
  }

  // simpleHash removed (no longer used)

  /**
   * Send lock command (OPEN/CLOSE)
   */
  public async sendLockCommand(gatewayId: string, lockId: string, command: 'OPEN' | 'CLOSE'): Promise<ICommandResult> {
    return await this.executeDeviceCommand(gatewayId, lockId, command);
  }

  /**
   * Check if gateway supports getting all locks
   */
  public canGetAllLocks(gatewayId: string): boolean {
    const gateway = this.activeGateways.get(gatewayId);
    return gateway ? typeof gateway.getAllLocks === 'function' : false;
  }

  /**
   * Get all locks from gateway
   */
  public async getAllLocks(gatewayId: string): Promise<any[]> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    // Use gateway specific method if available
    if (gateway.getAllLocks) {
      return await gateway.getAllLocks();
    }

    return [];
  }

  /**
   * Send FCM message for push notifications
   */
  public async sendFCMMessage(gatewayId: string, token: string, data: any): Promise<ICommandResult> {
    const gateway = this.activeGateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    // Use gateway specific method if available
    if (gateway.sendFCMMessage) {
      return await gateway.sendFCMMessage(token, data);
    }

    throw new Error(`FCM messaging not implemented for gateway type`);
  }

  /**
   * Get gateway status
   */
  public getGatewayStatus(gatewayId: string): any {
    const gateway = this.activeGateways.get(gatewayId);
    return gateway ? gateway.status : null;
  }

  /**
   * Get all gateway statuses
   */
  public getAllGatewayStatuses(): any[] {
    return this.getAllGateways().map(gateway => gateway.status);
  }

  /**
   * Shutdown all gateways
   */
  public async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.activeGateways.values()).map(gateway =>
      gateway.shutdown().catch(error => {
        console.error(`Error shutting down gateway ${gateway.id}:`, error);
      })
    );

    await Promise.all(shutdownPromises);
    this.activeGateways.clear();
  }

  /**
   * Set up event listeners for a gateway
   */
  private setupGatewayEventListeners(gateway: IGateway): void {
    gateway.on('initialized', () => {
      this.emit('gatewayInitialized', gateway.id);
    });

    gateway.on('connected', () => {
      this.emit('gatewayConnected', gateway.id);
    });

    gateway.on('disconnected', () => {
      this.emit('gatewayDisconnected', gateway.id);
    });

    gateway.on('deviceRegistered', (deviceInfo) => {
      this.emit('deviceRegistered', gateway.id, deviceInfo);
    });

    gateway.on('deviceUnregistered', (deviceId) => {
      this.emit('deviceUnregistered', gateway.id, deviceId);
    });

    gateway.on('error', (error) => {
      this.emit('gatewayError', gateway.id, error);
    });

    gateway.on('statusChanged', (status) => {
      this.emit('gatewayStatusChanged', gateway.id, status);
    });
  }
}
