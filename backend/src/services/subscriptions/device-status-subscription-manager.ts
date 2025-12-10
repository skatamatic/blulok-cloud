import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { DeviceModel } from '@/models/device.model';

/**
 * Device Status Subscription Manager
 *
 * Manages real-time subscriptions to individual device status updates.
 * Provides live telemetry data including battery level, signal strength,
 * temperature, lock status, and error information.
 *
 * Subscription Type: 'device_status'
 *
 * Key Features:
 * - Real-time device telemetry updates
 * - Individual device targeting via device_id filter
 * - Facility-scoped updates for broad monitoring
 * - Lock state and battery level tracking
 * - Signal strength and temperature monitoring
 * - Error code and message reporting
 *
 * Data Provided:
 * - Device identification (id, serial, unit info)
 * - Lock status (locked, unlocked, locking, unlocking, error, etc.)
 * - Device status (online, offline, low_battery, error)
 * - Battery level (0-100%)
 * - Signal strength (dBm)
 * - Temperature (Celsius)
 * - Error code and message (if applicable)
 * - Last activity and last seen timestamps
 * - Firmware version
 *
 * Access Control:
 * - All authenticated users can subscribe
 * - Device data filtered based on user's facility access
 * - Tenants only see devices for units they're assigned to
 *
 * Subscription Parameters:
 * - device_id: (optional) Subscribe to a specific device
 * - facility_id: (optional) Subscribe to all devices in a facility
 */
export class DeviceStatusSubscriptionManager extends BaseSubscriptionManager {
  private deviceModel: DeviceModel;
  // Store filters per subscription for targeted updates
  private subscriptionFilters: Map<string, { deviceId?: string; facilityId?: string }> = new Map();

  constructor() {
    super();
    this.deviceModel = new DeviceModel();
  }

  getSubscriptionType(): string {
    return 'device_status';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All authenticated users can subscribe to device status
    return true;
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    // Extract filters from message data
    const filters = message.data || {};
    const deviceId = filters.device_id || filters.deviceId;
    const facilityId = filters.facility_id || filters.facilityId;

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    // Check permissions
    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    // Store filters for this subscription
    this.subscriptionFilters.set(subscriptionId, { deviceId, facilityId });

    // Store client context
    this.clientContext.set(subscriptionId, client);

    // Add to watchers
    this.addWatcher(subscriptionId, ws, client);

    // Send initial data
    await this.sendInitialData(ws, subscriptionId, client);

    this.logger.info(`📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}${deviceId ? ` (device: ${deviceId})` : ''}${facilityId ? ` (facility: ${facilityId})` : ''}`);
    return true;
  }

  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      this.sendError(ws, 'Subscription ID required');
      return;
    }

    this.removeWatcher(subscriptionId, ws, client);
    this.clientContext.delete(subscriptionId);
    this.subscriptionFilters.delete(subscriptionId);
    this.logger.info(`📡 ${this.getSubscriptionType()} unsubscription: ${subscriptionId} for user ${client.userId}`);
  }

  cleanup(ws: WebSocket, client: SubscriptionClient): void {
    // Remove this WebSocket from all watchers and clean up filters
    this.watchers.forEach((watcherSet, key) => {
      if (watcherSet.has(ws)) {
        watcherSet.delete(ws);
        if (watcherSet.size === 0) {
          this.watchers.delete(key);
          this.clientContext.delete(key);
          this.subscriptionFilters.delete(key);
        }
      }
    });
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const filters = this.subscriptionFilters.get(subscriptionId);
      
      // Build query filters based on subscription parameters and user access
      const queryFilters: any = {};
      
      if (filters?.deviceId) {
        queryFilters.id = filters.deviceId;
      }
      
      if (filters?.facilityId) {
        queryFilters.facility_id = filters.facilityId;
      }
      
      // Apply facility scoping for non-admin users
      if (client.userRole !== UserRole.ADMIN && client.userRole !== UserRole.DEV_ADMIN) {
        if (client.facilityIds && client.facilityIds.length > 0) {
          // If user has facility access but filter requests a specific facility, validate it
          if (filters?.facilityId && !client.facilityIds.includes(filters.facilityId)) {
            this.sendError(ws, 'Access denied: You do not have access to this facility');
            return;
          }
          // Only return devices from accessible facilities
          if (!filters?.facilityId && client.facilityIds.length === 1) {
            queryFilters.facility_id = client.facilityIds[0];
          }
        }
      }

      let devices: any[] = [];
      
      if (filters?.deviceId) {
        // Single device subscription
        const device = await this.deviceModel.findBluLokDeviceById(filters.deviceId);
        if (device) {
          devices = [device];
        }
      } else {
        // Multiple devices subscription
        devices = await this.deviceModel.findBluLokDevices(queryFilters);
      }

      // Format device data
      const deviceData = devices.map(d => this.formatDeviceStatus(d));

      this.sendMessage(ws, {
        type: 'device_status_update',
        subscriptionId,
        data: {
          devices: deviceData,
          count: deviceData.length,
          lastUpdated: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial device status data:', error);
      this.sendError(ws, 'Failed to load initial device status data');
    }
  }

  /**
   * Format device data for WebSocket transmission
   */
  private formatDeviceStatus(device: any): any {
    return {
      id: device.id,
      device_serial: device.device_serial,
      unit_id: device.unit_id,
      unit_number: device.unit_number,
      facility_id: device.facility_id,
      facility_name: device.facility_name,
      gateway_id: device.gateway_id,
      gateway_name: device.gateway_name,
      lock_status: device.lock_status,
      device_status: device.device_status,
      battery_level: device.battery_level,
      signal_strength: device.signal_strength,
      temperature: device.temperature,
      error_code: device.error_code,
      error_message: device.error_message,
      firmware_version: device.firmware_version,
      last_activity: device.last_activity,
      last_seen: device.last_seen,
      updated_at: device.updated_at
    };
  }

  /**
   * Broadcast update for a specific device
   * Called when device state changes
   */
  public async broadcastDeviceUpdate(deviceId: string, facilityId?: string): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      // Get fresh device data
      const device = await this.deviceModel.findBluLokDeviceById(deviceId);
      if (!device) {
        this.logger.warn(`Device ${deviceId} not found for broadcast`);
        return;
      }

      const deviceData = this.formatDeviceStatus(device);

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        const filters = this.subscriptionFilters.get(subscriptionId);
        
        if (!client) continue;

        // Check if this subscription should receive this device's updates
        // 1. If subscribed to specific device, only send if it matches
        if (filters?.deviceId && filters.deviceId !== deviceId) {
          continue;
        }
        
        // 2. If subscribed to specific facility, only send if it matches
        if (filters?.facilityId && facilityId && filters.facilityId !== facilityId) {
          continue;
        }

        // 3. Check facility access for non-admin users
        if (client.userRole !== UserRole.ADMIN && client.userRole !== UserRole.DEV_ADMIN) {
          if (client.facilityIds && facilityId && !client.facilityIds.includes(facilityId)) {
            continue;
          }
        }

        const watchers = this.watchers.get(subscriptionId);
        
        if (watchers) {
          watchers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'device_status_update',
                  subscriptionId,
                  data: {
                    devices: [deviceData],
                    count: 1,
                    updatedDeviceId: deviceId,
                    lastUpdated: new Date().toISOString()
                  },
                  timestamp: new Date().toISOString()
                }));
              } catch (error) {
                this.logger.error(`Error sending device status to WebSocket:`, error);
                watchers.delete(ws);
                if (watchers.size === 0) {
                  this.watchers.delete(subscriptionId);
                  this.clientContext.delete(subscriptionId);
                  this.subscriptionFilters.delete(subscriptionId);
                }
              }
            } else {
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
                this.subscriptionFilters.delete(subscriptionId);
              }
            }
          });
        }
      }
    } catch (error) {
      this.logger.error('Error broadcasting device status update:', error);
    }
  }

  /**
   * Broadcast update for all devices (used for general refreshes)
   */
  public async broadcastUpdate(): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      
      if (activeSubscriptions.length === 0) {
        return;
      }

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) continue;

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers || watchers.size === 0) continue;

        // Re-send initial data to each watcher
        for (const ws of watchers) {
          if (ws.readyState === WebSocket.OPEN) {
            await this.sendInitialData(ws, subscriptionId, client);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error broadcasting general device status update:', error);
    }
  }
}

