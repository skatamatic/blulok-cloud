import { BaseGateway } from './base.gateway';
import { IGatewayCapabilities, IDeviceInfo, DeviceType, ProtocolVersion } from '../../../types/gateway.types';
import { IProtocol } from '../../../types/gateway.types';
import { IGatewayConnection } from '../../../types/gateway.types';
import { ProtocolFactory } from '../protocols/protocol-factory';
import { SimulatedConnection } from '../connections/simulated.connection';

/**
 * Simulated gateway for testing and development
 */
export class SimulatedGateway extends BaseGateway {
  private simulatedDevices = new Map<string, any>();

  constructor(
    id: string,
    facilityId: string,
    protocolVersion: ProtocolVersion = ProtocolVersion.SIMULATED,
    keyManagementVersion: 'v1' | 'v2' = 'v1'
  ) {
    super(id, facilityId, protocolVersion, keyManagementVersion);
  }

  /**
   * Get gateway capabilities
   */
  public get capabilities(): IGatewayCapabilities {
    return {
      supportedProtocols: [ProtocolVersion.SIMULATED],
      maxConnections: 1,
      supportedDeviceTypes: [
        DeviceType.LOCK,
        DeviceType.ACCESS_CONTROL,
        DeviceType.SENSOR,
      ],
      firmwareUpdateSupport: true,
      remoteAccessSupport: true,
      keyManagementSupport: true,
      heartbeatInterval: 5000, // 5 seconds for testing
    };
  }

  /**
   * Create protocol instance
   */
  protected createProtocol(): IProtocol {
    return ProtocolFactory.createProtocol(ProtocolVersion.SIMULATED);
  }

  /**
   * Create connection instance
   */
  protected createConnection(): IGatewayConnection {
    return new SimulatedConnection(
      this.id,
      1.0, // 100% reliability for deterministic testing
      this.capabilities.heartbeatInterval
    );
  }

  /**
   * Send device registration to simulated gateway
   */
  protected async sendDeviceRegistration(deviceInfo: IDeviceInfo): Promise<void> {
    // Simulate device registration delay
    await this.simulateDelay(100, 300);

    // Store simulated device state
    this.simulatedDevices.set(deviceInfo.id, {
      ...deviceInfo,
      registered: true,
      status: 'online',
      batteryLevel: 85,
      lastActivity: new Date(),
    });

    console.log(`[SIMULATED] Device ${deviceInfo.id} registered with gateway ${this.id}`);
  }

  /**
   * Send device unregistration to simulated gateway
   */
  protected async sendDeviceUnregistration(deviceId: string): Promise<void> {
    // Simulate device unregistration delay
    await this.simulateDelay(50, 150);

    // Remove simulated device state
    this.simulatedDevices.delete(deviceId);

    console.log(`[SIMULATED] Device ${deviceId} unregistered from gateway ${this.id}`);
  }

  /**
   * Get simulated device status
   */
  public override async getDeviceStatus(deviceId: string): Promise<any> {
    // Simulate API delay
    await this.simulateDelay(50, 200);

    const device = this.simulatedDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Simulate realistic status with some variation
    return {
      id: deviceId,
      connectionState: Math.random() > 0.1 ? 'online' : 'offline', // 90% online
      batteryLevel: Math.max(0, device.batteryLevel + (Math.random() - 0.5) * 10), // +/- 5%
      signalStrength: Math.floor(Math.random() * 100),
      temperature: 20 + (Math.random() - 0.5) * 10, // 15-25°C
      lastActivity: new Date(),
      hasError: Math.random() > 0.95, // 5% error rate
    };
  }

  /**
   * Execute simulated device command
   */
  public override async executeDeviceCommand(deviceId: string, command: string, _params?: any): Promise<any> {
    // Simulate command execution delay
    await this.simulateDelay(200, 1000);

    const device = this.simulatedDevices.get(deviceId);
    if (!device) {
      return {
        success: false,
        error: `Device ${deviceId} not found`,
        executedAt: new Date(),
        duration: 0,
      };
    }

    // Simulate command success/failure
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      // Update simulated device state based on command
      switch (command) {
        case 'lock':
          device.status = 'locked';
          break;
        case 'unlock':
          device.status = 'unlocked';
          break;
        case 'beep':
          // Just acknowledge
          break;
      }
    }

    console.log(`[SIMULATED] Command "${command}" ${success ? 'succeeded' : 'failed'} on device ${deviceId}`);

    return {
      success,
      data: success ? { status: device.status } : undefined,
      error: success ? undefined : 'Simulated command failure',
      executedAt: new Date(),
      duration: Math.floor(Math.random() * 500) + 100,
    };
  }

  /**
   * Simulate network delay
   */
  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Get all simulated devices
   */
  public getSimulatedDevices(): any[] {
    return Array.from(this.simulatedDevices.values());
  }

  /**
   * Perform device synchronization for simulated gateway
   */
  public override async sync(_updateStatus: boolean = false): Promise<{
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
      console.log(`[SIMULATED] Performing sync for gateway ${this.id}`);

      // Convert simulated devices to GatewayDeviceData format
      const gatewayDevices = Array.from(this.simulatedDevices.entries()).map(([deviceId, device]) => ({
        id: deviceId,
        serial: device.serial || deviceId,
        online: device.status === 'online',
        locked: device.status === 'locked',
        batteryLevel: device.batteryLevel,
        signalStrength: Math.floor(Math.random() * 100), // Simulate signal strength
        temperature: 20 + (Math.random() - 0.5) * 10, // Simulate temperature
        lastSeen: new Date(),
      }));

      syncResults.devicesFound = gatewayDevices.length;

      // Sync with backend using the base gateway method
      await this.syncDeviceData(gatewayDevices);
      syncResults.devicesSynced = gatewayDevices.length;

      // Convert to detailed device format with simulated keys
      const devicesWithKeys = gatewayDevices.map(device => ({
        id: device.id,
        serial: device.serial,
        online: device.online,
        locked: device.locked,
        batteryLevel: device.batteryLevel,
        signalStrength: device.signalStrength,
        temperature: device.temperature,
        keys: [
          { keyCode: 12345, user: 'admin', valid: true },
          { keyCode: 67890, user: 'user1', valid: true }
        ] // Simulated keys
      }));

      syncResults.keysRetrieved = devicesWithKeys.reduce((total, device) => total + device.keys.length, 0);

      console.log(`[SIMULATED] Sync completed for gateway ${this.id} (${gatewayDevices.length} devices)`);
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
   * Reset simulated state
   */
  public reset(): void {
    this.simulatedDevices.clear();
  }
}
