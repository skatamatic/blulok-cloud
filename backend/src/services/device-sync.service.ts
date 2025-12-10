import { DeviceModel, BluLokDevice, CreateBluLokDeviceData, DeviceStateUpdate } from '../models/device.model';
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
 * Device Inventory Item for inventory sync endpoint.
 * Represents a device that should exist on the gateway.
 * 
 * Now supports all state fields as well, allowing inventory sync
 * to also update device state in a single call.
 */
export interface DeviceInventoryItem {
  /** Lock identifier (UUID or serial) - required */
  lock_id: string;
  /** Lock number for display */
  lock_number?: number;
  /** Device state: 'CLOSED' = locked, 'OPENED' = unlocked */
  state?: 'CLOSED' | 'OPENED' | 'ERROR' | 'UNKNOWN';
  /** Legacy lock state field */
  lock_state?: 'LOCKED' | 'UNLOCKED' | 'LOCKING' | 'UNLOCKING' | 'ERROR' | 'UNKNOWN';
  /** Boolean lock status */
  locked?: boolean;
  /** Battery level in raw units (mV) */
  battery_level?: number;
  /** Battery unit (e.g., 'mV') */
  battery_unit?: string;
  /** Device online status */
  online?: boolean;
  /** Signal strength */
  signal_strength?: number;
  /** Temperature value */
  temperature_value?: number;
  /** Temperature unit (e.g., '°C') */
  temperature_unit?: string;
  /** Firmware version string */
  firmware_version?: string;
  /** Last seen timestamp */
  last_seen?: string | Date;
}

/**
 * Result of an inventory sync operation.
 */
export interface InventorySyncResult {
  added: number;
  removed: number;
  unchanged: number;
  errors: string[];
}

/**
 * Result of a state update operation.
 */
export interface StateUpdateResult {
  updated: number;
  not_found: string[];
  errors: string[];
}

// Re-export DeviceStateUpdate for convenience
export { DeviceStateUpdate };

/**
 * Utility function to map device status from API format to locked boolean.
 * Handles both "Closed"/"Opened" string status and boolean locked fields.
 * Returns undefined when status cannot be determined, allowing explicit 'unknown' status.
 * 
 * @param device - Raw device data from gateway API (may have status or locked field)
 * @returns boolean indicating if device is locked (true) or unlocked (false), or undefined if unknown
 */
export function mapDeviceLockStatus(device: any): boolean | undefined {
  // If locked is already a boolean, use it directly
  if (typeof device.locked === 'boolean') {
    return device.locked;
  }
  
  // If status field exists, map "Closed" -> true, "Opened" -> false
  if (device.status !== undefined && device.status !== null) {
    const statusLower = String(device.status).toLowerCase().trim();
    if (statusLower === 'closed') {
      return true;
    } else if (statusLower === 'opened') {
      return false;
    }
    // If status is something other than Closed/Opened, return undefined
    return undefined;
  }
  
  // Return undefined if status cannot be determined - will be set to 'unknown'
  return undefined;
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

      // PERFORMANCE FIX: Bulk add new devices instead of sequential inserts
      if (devicesToAdd.length > 0) {
        const deviceDataToInsert = devicesToAdd
          .map(gatewayDevice => {
            const deviceId = gatewayDevice.serial || gatewayDevice.id || gatewayDevice.lockId;
            if (!deviceId) return null;
            
            const createData: any = {
              gateway_id: gatewayId,
              device_serial: deviceId,
              device_settings: JSON.stringify({ gatewayData: gatewayDevice }),
              metadata: JSON.stringify({
                autoCreated: true,
                createdFromGatewaySync: true,
                gatewayType: 'http'
              })
            };

            if (gatewayDevice.firmwareVersion) {
              createData.firmware_version = gatewayDevice.firmwareVersion;
            }

            return createData;
          })
          .filter(d => d !== null);

        if (deviceDataToInsert.length > 0) {
          try {
            const count = await this.deviceModel.bulkCreateBluLokDevices(deviceDataToInsert);
            console.log(`[DEVICE-SYNC] Bulk added ${count} devices from gateway ${gatewayId}`);
          } catch (error) {
            console.error(`Failed to bulk add devices for gateway ${gatewayId}:`, error);
            // Fall back to individual inserts on bulk failure
            for (const gatewayDevice of devicesToAdd) {
              await this.addGatewayDevice(gatewayId, gatewayDevice);
            }
          }
        }
      }

      // PERFORMANCE FIX: Bulk remove devices instead of sequential deletes
      if (devicesToRemove.length > 0) {
        const deviceIdsToRemove = devicesToRemove.map(d => d.id);
        try {
          const count = await this.deviceModel.bulkDeleteBluLokDevices(deviceIdsToRemove);
          console.log(`[DEVICE-SYNC] Bulk removed ${count} devices from gateway ${gatewayId}`);
          
          // Emit device removed events
          for (const device of devicesToRemove) {
            this.eventService.emitDeviceRemoved({
              deviceId: device.id,
              deviceType: 'blulok',
              gatewayId: device.gateway_id
            });
          }
        } catch (error) {
          console.error(`Failed to bulk remove devices for gateway ${gatewayId}:`, error);
          // Fall back to individual deletes on bulk failure
          for (const device of devicesToRemove) {
            await this.removeGatewayDevice(device);
          }
        }
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
      const logMessage = device.unit_id
        ? `[DEVICE-SYNC] Device ${device.device_serial} (assigned to unit ${device.unit_id}) no longer exists on gateway ${device.gateway_id}, removing from database`
        : `[DEVICE-SYNC] Device ${device.device_serial} no longer exists on gateway ${device.gateway_id}, removing from database`;
      
      console.log(logMessage);
      
      // Delete the device (foreign key constraint will handle unit_id relationship)
      await this.deviceModel.deleteBluLokDevice(device.id);

      // Emit device removed event
      this.eventService.emitDeviceRemoved({
        deviceId: device.id,
        deviceType: 'blulok',
        gatewayId: device.gateway_id
      });

      // Log if device was assigned to a unit (for visibility)
      if (device.unit_id) {
        console.log(`[DEVICE-SYNC] Note: Unit ${device.unit_id} no longer has an associated device after removal`);
      }
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
    // Handle locked field - if undefined, set to 'unknown' to explicitly show status is unclear
    const newLockStatus = gatewayDevice.locked === true ? 'locked' : 
                         gatewayDevice.locked === false ? 'unlocked' : 
                         'unknown'; // Explicitly show unknown when status cannot be determined

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

  // ============================================================================
  // NEW ENDPOINTS: Split inventory and state management
  // ============================================================================

  /**
   * Sync device inventory for a gateway.
   * This method handles adding new devices and removing devices not in the list.
   * Does NOT update transient state (battery, lock state, etc.).
   * 
   * @param gatewayId - The gateway ID
   * @param devices - Array of devices that should exist on the gateway
   * @returns Promise resolving to sync result with counts
   */
  public async syncDeviceInventory(
    gatewayId: string,
    devices: DeviceInventoryItem[]
  ): Promise<InventorySyncResult> {
    const result: InventorySyncResult = {
      added: 0,
      removed: 0,
      unchanged: 0,
      errors: [],
    };

    try {
      // Get all BluLok devices for this gateway from our database
      const existingDevices = await this.deviceModel.findBluLokDevices({
        gateway_id: gatewayId,
      });

      // Create maps for easier lookup using device serial/identifier
      const incomingDeviceMap = new Map<string, DeviceInventoryItem>();
      for (const device of devices) {
        if (device.lock_id) {
          incomingDeviceMap.set(device.lock_id, device);
        }
      }

      const existingDeviceMap = new Map(
        existingDevices.map((device) => [device.device_serial, device])
      );

      // PERFORMANCE FIX: Collect devices to add and remove, then bulk process
      const devicesToAdd: CreateBluLokDeviceData[] = [];
      const devicesToUpdateState: Array<{ lockId: string; item: DeviceInventoryItem }> = [];
      
      for (const [lockId, inventoryItem] of incomingDeviceMap) {
        if (!existingDeviceMap.has(lockId)) {
          const createData: CreateBluLokDeviceData = {
            gateway_id: gatewayId,
            device_serial: lockId,
            device_settings: { lockNumber: inventoryItem.lock_number },
            metadata: {
              autoCreated: true,
              createdFromInventorySync: true,
            },
          };

          if (inventoryItem.firmware_version) {
            createData.firmware_version = inventoryItem.firmware_version;
          }

          devicesToAdd.push(createData);
        } else {
          // Device exists - collect for state update if any state fields provided
          devicesToUpdateState.push({ lockId, item: inventoryItem });
          result.unchanged++;
        }
      }

      // Bulk add new devices
      if (devicesToAdd.length > 0) {
        try {
          const count = await this.deviceModel.bulkCreateBluLokDevices(devicesToAdd);
          result.added = count;
          console.log(`[DEVICE-SYNC] Bulk added ${count} devices from inventory sync`);
        } catch (error: any) {
          result.errors.push(`Bulk add failed: ${error.message}`);
          // Fall back to individual inserts
          for (const createData of devicesToAdd) {
            try {
              await this.deviceModel.createBluLokDevice(createData);
              result.added++;
            } catch (err: any) {
              result.errors.push(`Failed to add device ${createData.device_serial}: ${err.message}`);
            }
          }
        }
      }

      // Update device state for existing devices (including firmware, battery, lock state, etc.)
      for (const { lockId, item } of devicesToUpdateState) {
        const stateUpdate = this.mapInventoryItemToStateUpdate(item);
        if (Object.keys(stateUpdate).length > 0) {
          try {
            await this.deviceModel.updateBluLokDeviceState(lockId, stateUpdate);
          } catch (error: any) {
            result.errors.push(`Failed to update state for ${lockId}: ${error.message}`);
          }
        }
      }

      // Find and bulk remove devices not in incoming list
      const devicesToRemove: BluLokDevice[] = [];
      for (const [deviceSerial, device] of existingDeviceMap) {
        if (!incomingDeviceMap.has(deviceSerial)) {
          devicesToRemove.push(device);
        }
      }

      if (devicesToRemove.length > 0) {
        try {
          const deviceIds = devicesToRemove.map(d => d.id);
          const count = await this.deviceModel.bulkDeleteBluLokDevices(deviceIds);
          result.removed = count;
          console.log(`[DEVICE-SYNC] Bulk removed ${count} devices from inventory sync`);
          
          // Emit device removed events
          for (const device of devicesToRemove) {
            this.eventService.emitDeviceRemoved({
              deviceId: device.id,
              deviceType: 'blulok',
              gatewayId: device.gateway_id
            });
          }
        } catch (error: any) {
          result.errors.push(`Bulk remove failed: ${error.message}`);
          // Fall back to individual deletes
          for (const device of devicesToRemove) {
            try {
              await this.removeGatewayDevice(device);
              result.removed++;
            } catch (err: any) {
              result.errors.push(`Failed to remove device ${device.device_serial}: ${err.message}`);
            }
          }
        }
      }

      console.log(
        `[DEVICE-SYNC] Inventory sync complete: added=${result.added}, removed=${result.removed}, unchanged=${result.unchanged}`
      );
    } catch (error: any) {
      console.error(`Error in inventory sync for gateway ${gatewayId}:`, error);
      result.errors.push(`Sync failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Map a state update to database format.
   * Handles all field mappings including new gateway format fields.
   */
  private mapStateUpdateToDbFormat(update: DeviceStateUpdate): Parameters<typeof this.deviceModel.updateBluLokDeviceState>[1] {
    const dbUpdates: Parameters<typeof this.deviceModel.updateBluLokDeviceState>[1] = {};

    // Map 'state' field (CLOSED/OPENED) to lock_status
    if (update.state) {
      const stateMap: Record<string, 'locked' | 'unlocked' | 'error' | 'unknown'> = {
        'CLOSED': 'locked',
        'OPENED': 'unlocked',
        'ERROR': 'error',
        'UNKNOWN': 'unknown',
      };
      dbUpdates.lock_status = stateMap[update.state] || 'unknown';
    }

    // Map legacy lock_state to lock_status (if state not provided)
    if (!dbUpdates.lock_status && update.lock_state) {
      const lockStateMap: Record<string, 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'unknown'> = {
        'LOCKED': 'locked',
        'UNLOCKED': 'unlocked',
        'LOCKING': 'locking',
        'UNLOCKING': 'unlocking',
        'ERROR': 'error',
        'UNKNOWN': 'unknown',
      };
      dbUpdates.lock_status = lockStateMap[update.lock_state] || 'unknown';
    }

    // Map 'locked' boolean to lock_status (if neither state nor lock_state provided)
    if (!dbUpdates.lock_status && update.locked !== undefined) {
      dbUpdates.lock_status = update.locked ? 'locked' : 'unlocked';
    }

    // Map online to device_status
    if (update.online !== undefined) {
      dbUpdates.device_status = update.online ? 'online' : 'offline';
    }

    // Direct mappings
    if (update.battery_level !== undefined) {
      dbUpdates.battery_level = update.battery_level;
    }
    if (update.signal_strength !== undefined) {
      dbUpdates.signal_strength = update.signal_strength;
    }
    // Handle both 'temperature' and 'temperature_value' fields
    if (update.temperature !== undefined) {
      dbUpdates.temperature = update.temperature;
    } else if (update.temperature_value !== undefined) {
      dbUpdates.temperature = update.temperature_value;
    }
    if (update.firmware_version !== undefined) {
      dbUpdates.firmware_version = update.firmware_version;
    }
    if (update.error_code !== undefined) {
      dbUpdates.error_code = update.error_code;
    }
    if (update.error_message !== undefined) {
      dbUpdates.error_message = update.error_message;
    }
    if (update.last_seen !== undefined) {
      dbUpdates.last_seen = typeof update.last_seen === 'string' 
        ? new Date(update.last_seen) 
        : update.last_seen;
    }

    return dbUpdates;
  }

  /**
   * Map inventory item to state update format for database.
   * Used when inventory sync includes state fields.
   */
  private mapInventoryItemToStateUpdate(item: DeviceInventoryItem): Parameters<typeof this.deviceModel.updateBluLokDeviceState>[1] {
    const dbUpdates: Parameters<typeof this.deviceModel.updateBluLokDeviceState>[1] = {};

    // Map 'state' field (CLOSED/OPENED) to lock_status
    if (item.state) {
      const stateMap: Record<string, 'locked' | 'unlocked' | 'error' | 'unknown'> = {
        'CLOSED': 'locked',
        'OPENED': 'unlocked',
        'ERROR': 'error',
        'UNKNOWN': 'unknown',
      };
      dbUpdates.lock_status = stateMap[item.state] || 'unknown';
    }

    // Map legacy lock_state to lock_status (if state not provided)
    if (!dbUpdates.lock_status && item.lock_state) {
      const lockStateMap: Record<string, 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'unknown'> = {
        'LOCKED': 'locked',
        'UNLOCKED': 'unlocked',
        'LOCKING': 'locking',
        'UNLOCKING': 'unlocking',
        'ERROR': 'error',
        'UNKNOWN': 'unknown',
      };
      dbUpdates.lock_status = lockStateMap[item.lock_state] || 'unknown';
    }

    // Map 'locked' boolean to lock_status (if neither state nor lock_state provided)
    if (!dbUpdates.lock_status && item.locked !== undefined) {
      dbUpdates.lock_status = item.locked ? 'locked' : 'unlocked';
    }

    // Map online to device_status
    if (item.online !== undefined) {
      dbUpdates.device_status = item.online ? 'online' : 'offline';
    }

    // Direct mappings
    if (item.battery_level !== undefined) {
      dbUpdates.battery_level = item.battery_level;
    }
    if (item.signal_strength !== undefined) {
      dbUpdates.signal_strength = item.signal_strength;
    }
    if (item.temperature_value !== undefined) {
      dbUpdates.temperature = item.temperature_value;
    }
    if (item.firmware_version !== undefined) {
      dbUpdates.firmware_version = item.firmware_version;
    }
    if (item.last_seen !== undefined) {
      dbUpdates.last_seen = typeof item.last_seen === 'string' 
        ? new Date(item.last_seen) 
        : item.last_seen;
    }

    return dbUpdates;
  }

  /**
   * Update device states with partial data.
   * Only updates fields that are provided in each update.
   * 
   * @param gatewayId - The gateway ID (for validation/logging)
   * @param updates - Array of partial state updates
   * @returns Promise resolving to update result with counts
   */
  public async updateDeviceStates(
    gatewayId: string,
    updates: DeviceStateUpdate[]
  ): Promise<StateUpdateResult> {
    const result: StateUpdateResult = {
      updated: 0,
      not_found: [],
      errors: [],
    };

    for (const update of updates) {
      try {
        // Map incoming state update to database format
        const dbUpdates = this.mapStateUpdateToDbFormat(update);

        // Skip if no actual updates
        if (Object.keys(dbUpdates).length === 0) {
          continue;
        }

        // Apply update
        const updated = await this.deviceModel.updateBluLokDeviceState(update.lock_id, dbUpdates);

        if (updated) {
          result.updated++;
          console.log(`[DEVICE-SYNC] Updated state for device ${update.lock_id}`);
        } else {
          result.not_found.push(update.lock_id);
        }
      } catch (error: any) {
        result.errors.push(`Failed to update ${update.lock_id}: ${error.message}`);
      }
    }

    console.log(
      `[DEVICE-SYNC] State update complete: updated=${result.updated}, not_found=${result.not_found.length}, errors=${result.errors.length}`
    );

    return result;
  }
}
