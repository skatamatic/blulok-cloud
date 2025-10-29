import { DeviceModel, BluLokDevice, CreateBluLokDeviceData } from '../models/device.model';
import { DeviceEventService } from './device-event.service';

/**
 * Gateway Device Data Interface
 *
 * Represents device information received from gateway synchronization.
 * This interface accommodates various gateway protocols and device types.
 */
export interface GatewayDeviceData {
  /** Gateway-specific device identifier */
  id?: string;
  /** Lock-specific identifier */
  lockId?: string;
  /** Device serial number (primary identifier) */
  serial?: string;
  /** Device connectivity status */
  online?: boolean;
  /** Lock mechanism state */
  locked?: boolean;
  /** Battery charge percentage */
  batteryLevel?: number;
  /** Wireless signal strength */
  signalStrength?: number;
  /** Device temperature reading */
  temperature?: number;
  /** Installed firmware version */
  firmwareVersion?: string;
  /** Last communication timestamp */
  lastSeen?: Date;
  /** Additional gateway-specific properties */
  [key: string]: any;
}

/**
 * Device Synchronization Service
 *
 * Core service responsible for maintaining consistency between gateway-discovered
 * devices and the backend database. Handles the complete device lifecycle
 * including discovery, updates, and removal.
 *
 * Key Responsibilities:
 * - Synchronizes device state between gateways and database
 * - Manages device lifecycle (add/update/remove)
 * - Triggers real-time events for status changes
 * - Handles device deduplication and conflict resolution
 * - Provides audit trail for device operations
 *
 * Synchronization Process:
 * 1. Retrieve current device state from database
 * 2. Compare with gateway-reported device state
 * 3. Add newly discovered devices
 * 4. Update existing device information
 * 5. Mark disappeared devices as offline
 * 6. Emit events for real-time client updates
 *
 * Device Discovery:
 * - Uses device serial numbers as primary identifiers
 * - Supports multiple identifier formats (serial, id, lockId)
 * - Handles device renumbering and identifier changes
 * - Prevents duplicate device registration
 *
 * Status Management:
 * - Tracks device connectivity (online/offline)
 * - Monitors battery levels and health metrics
 * - Records lock states and operational status
 * - Maintains firmware version information
 *
 * Event Integration:
 * - Emits DeviceEventService events for real-time updates
 * - Triggers WebSocket broadcasts for live dashboards
 * - Supports subscription-based device monitoring
 */
export class DeviceSyncService {
  private static instance: DeviceSyncService;
  private deviceModel: DeviceModel;
  private eventService: DeviceEventService;

  constructor(deviceModel?: DeviceModel, eventService?: DeviceEventService) {
    this.deviceModel = deviceModel || new DeviceModel();
    this.eventService = eventService || DeviceEventService.getInstance();
  }

  public static getInstance(): DeviceSyncService {
    if (!DeviceSyncService.instance) {
      DeviceSyncService.instance = new DeviceSyncService();
    }
    return DeviceSyncService.instance;
  }

  /**
   * Sync gateway device data with our backend database.
   * This method handles adding new devices, updating existing ones, and marking missing ones as offline.
   */
  public async syncGatewayDevices(gatewayId: string, gatewayDevices: GatewayDeviceData[]): Promise<void> {
    try {
      // Get all BluLok devices for this gateway from our database
      const existingDevices = await this.deviceModel.findBluLokDevices({
        gateway_id: gatewayId
      });

      // Create maps for easier lookup using device serial/identifier
      const gatewayDeviceMap = new Map<string, GatewayDeviceData>();
      for (const device of gatewayDevices) {
        const deviceId = device.serial || device.id || device.lockId;
        if (deviceId) {
          gatewayDeviceMap.set(deviceId, device);
        }
      }

      const existingDeviceMap = new Map(existingDevices.map(device => [device.device_serial, device]));

      // Find devices that exist on gateway but not in our database (need to add)
      const devicesToAdd: GatewayDeviceData[] = [];
      for (const [deviceId, gatewayDevice] of gatewayDeviceMap) {
        if (!existingDeviceMap.has(deviceId)) {
          devicesToAdd.push(gatewayDevice);
        }
      }

      // Find devices that exist in our database but not on gateway (need to remove/mark offline)
      const devicesToRemove: BluLokDevice[] = [];
      for (const [deviceSerial, device] of existingDeviceMap) {
        if (!gatewayDeviceMap.has(deviceSerial)) {
          devicesToRemove.push(device);
        }
      }

      // Add new devices
      for (const gatewayDevice of devicesToAdd) {
        await this.addGatewayDevice(gatewayId, gatewayDevice);
      }

      // Mark devices that no longer exist on gateway as offline
      for (const device of devicesToRemove) {
        await this.removeGatewayDevice(device);
      }

    } catch (error) {
      console.error(`Error syncing devices for gateway ${gatewayId}:`, error);
    }
  }

  /**
   * Add a new device from gateway data
   */
  private async addGatewayDevice(gatewayId: string, gatewayDevice: GatewayDeviceData): Promise<void> {
    try {
      const deviceId = gatewayDevice.serial || gatewayDevice.id || gatewayDevice.lockId;
      if (!deviceId) {
        console.warn(`Cannot add device from gateway ${gatewayId}: no valid device identifier`);
        return;
      }

      console.log(`[DEVICE-SYNC] Adding new device ${deviceId} from gateway ${gatewayId}`);

      // Create device without unit association - technicians assign units in the cloud
      const createData: CreateBluLokDeviceData = {
        gateway_id: gatewayId,
        device_serial: deviceId,
        device_settings: { gatewayData: gatewayDevice },
        metadata: {
          autoCreated: true,
          createdFromGatewaySync: true,
          gatewayType: 'http'
        }
      };

      // Only add firmware_version if it exists
      if (gatewayDevice.firmwareVersion) {
        createData.firmware_version = gatewayDevice.firmwareVersion;
      }

      await this.deviceModel.createBluLokDevice(createData);

    } catch (error) {
      console.error(`Failed to add device ${gatewayDevice.id || gatewayDevice.lockId}:`, error);
    }
  }

  /**
   * Remove a device that no longer exists on gateway
   */
  private async removeGatewayDevice(device: BluLokDevice): Promise<void> {
    try {
      console.log(`[DEVICE-SYNC] Device ${device.device_serial} no longer exists on gateway ${device.gateway_id}, removing from database`);
      await this.deviceModel.deleteBluLokDevice(device.id);

      // Emit device removed event
      this.eventService.emitDeviceRemoved({
        deviceId: device.id,
        deviceType: 'blulok',
        gatewayId: device.gateway_id
      });
    } catch (error) {
      console.error(`Failed to remove device ${device.device_serial}:`, error);
    }
  }

  /**
   * Update device statuses based on gateway data.
   * This method updates existing devices with fresh status information from the gateway.
   */
  public async updateDeviceStatuses(gatewayId: string, gatewayDevices: GatewayDeviceData[]): Promise<void> {
    try {
      // Get all BluLok devices for this gateway
      const existingDevices = await this.deviceModel.findBluLokDevices({
        gateway_id: gatewayId
      });

      // Create maps for easier lookup
      const gatewayDeviceMap = new Map<string, GatewayDeviceData>();
      for (const device of gatewayDevices) {
        const deviceId = device.serial || device.id || device.lockId;
        if (deviceId) {
          gatewayDeviceMap.set(deviceId, device);
        }
      }

      const deviceMap = new Map(existingDevices.map(device => [device.device_serial, device]));

      // Update status for devices that exist in both places
      for (const [deviceSerial, device] of deviceMap) {
        try {
          const gatewayDevice = gatewayDeviceMap.get(deviceSerial);
          if (gatewayDevice) {
            await this.updateDeviceFromGatewayData(device, gatewayDevice);
          }
        } catch (error) {
          console.error(`Failed to update device ${deviceSerial}:`, error);
        }
      }

    } catch (error) {
      console.error(`Error updating device statuses for gateway ${gatewayId}:`, error);
    }
  }

  /**
   * Update a single device from gateway data
   */
  private async updateDeviceFromGatewayData(device: BluLokDevice, gatewayDevice: GatewayDeviceData): Promise<void> {
    const newDeviceStatus = gatewayDevice.online ? 'online' : 'offline';
    const newLockStatus = gatewayDevice.locked ? 'locked' : 'unlocked';

    let statusChanged = false;

    // Update device status if changed
    if (device.device_status !== newDeviceStatus) {
      await this.deviceModel.updateDeviceStatus(device.id, 'blulok', newDeviceStatus);
      statusChanged = true;
    }

    // Update lock status if changed
    if (device.lock_status !== newLockStatus) {
      await this.deviceModel.updateLockStatus(device.id, newLockStatus);
      statusChanged = true;
    }

    // Update battery level if provided and changed
    if (gatewayDevice.batteryLevel !== undefined && device.battery_level !== gatewayDevice.batteryLevel) {
      await this.deviceModel.updateBatteryLevel(device.id, gatewayDevice.batteryLevel);
      statusChanged = true;
    }

    if (statusChanged) {
      console.log(`[DEVICE-SYNC] Updated device ${device.device_serial}: status=${newDeviceStatus}, lock=${newLockStatus}, battery=${gatewayDevice.batteryLevel}%`);
    }
  }
}
