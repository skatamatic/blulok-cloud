import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { DeviceModel } from '@/models/device.model';
import {
  DeviceReachabilityEnrichmentService,
} from '@/services/device-reachability-enrichment.service';

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
  private reachabilityEnrichment: DeviceReachabilityEnrichmentService;
  // Store filters per subscription for targeted updates
  private subscriptionFilters: Map<string, { deviceId?: string; facilityId?: string }> = new Map();

  constructor() {
    super();
    this.deviceModel = new DeviceModel();
    this.reachabilityEnrichment = DeviceReachabilityEnrichmentService.getInstance();
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

      if (filters?.deviceId) {
        const bluLok = await this.deviceModel.findBluLokDeviceById(filters.deviceId);
        const cache = await this.reachabilityEnrichment.createLivenessCache();
        if (bluLok) {
          const enriched = await this.reachabilityEnrichment.enrichBluLokRow(
            bluLok,
            cache,
          );
          this.sendMessage(ws, {
            type: 'device_status_update',
            subscriptionId,
            data: {
              devices: [this.formatDeviceStatus(enriched)],
              count: 1,
              lastUpdated: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
          return;
        } else {
          const accessControl = await this.deviceModel.findAccessControlDeviceWithGateway(filters.deviceId);
          if (accessControl) {
            const enriched = await this.reachabilityEnrichment.enrichAccessControlRow(
              accessControl,
              cache,
            );
            this.sendMessage(ws, {
              type: 'device_status_update',
              subscriptionId,
              data: {
                devices: [this.formatAccessControlDeviceStatus(enriched)],
                count: 1,
                lastUpdated: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
            });
            return;
          }
        }
      } else {
        const cache = await this.reachabilityEnrichment.createLivenessCache();
        const [blulokRows, accessRows] = await Promise.all([
          this.deviceModel.findBluLokDevices(queryFilters),
          this.deviceModel.findAccessControlDevices(queryFilters),
        ]);
        const deviceData = [
          ...(await Promise.all(
            blulokRows.map(async (d) => {
              const enriched = await this.reachabilityEnrichment.enrichBluLokRow(d, cache);
              return this.formatDeviceStatus(enriched);
            }),
          )),
          ...(await Promise.all(
            accessRows.map(async (d) => {
              const enriched = await this.reachabilityEnrichment.enrichAccessControlRow(d, cache);
              return this.formatAccessControlDeviceStatus(enriched);
            }),
          )),
        ];

        this.sendMessage(ws, {
          type: 'device_status_update',
          subscriptionId,
          data: {
            devices: deviceData,
            count: deviceData.length,
            lastUpdated: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      this.sendMessage(ws, {
        type: 'device_status_update',
        subscriptionId,
        data: {
          devices: [],
          count: 0,
          lastUpdated: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
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
    const deviceSettings =
      device.device_settings && typeof device.device_settings === 'object'
        ? device.device_settings
        : undefined;
    const displayName =
      deviceSettings && typeof deviceSettings.displayName === 'string'
        ? deviceSettings.displayName
        : deviceSettings && typeof deviceSettings.display_name === 'string'
          ? deviceSettings.display_name
          : undefined;

    return {
      id: device.id,
      device_serial: device.device_serial,
      name: displayName,
      device_settings: deviceSettings,
      unit_id: device.unit_id,
      unit_number: device.unit_number,
      facility_id: device.facility_id,
      facility_name: device.facility_name,
      gateway_id: device.gateway_id,
      gateway_name: device.gateway_name,
      lock_status: device.lock_status,
      device_status: device.device_status,
      reported_device_status: device.reported_device_status,
      status_unreachable_reason: device.status_unreachable_reason ?? null,
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

  /** Access-control rows use `is_locked` and `status`; map to the same WS shape clients expect. */
  private formatAccessControlDeviceStatus(device: any): any {
    const lockStatus = Boolean(device.is_locked) ? 'locked' : 'unlocked';
    return {
      id: device.id,
      device_serial: device.device_serial ?? device.name ?? device.id,
      name: device.name,
      location_description: device.location_description,
      unit_id: null,
      unit_number: null,
      facility_id: device.facility_id,
      facility_name: device.facility_name,
      gateway_id: device.gateway_id,
      gateway_name: device.gateway_name,
      supports_remote_lock: device.supports_remote_lock,
      supports_widget_timed_open: device.supports_widget_timed_open,
      has_lock_feedback: device.has_lock_feedback,
      no_feedback_open_timeout_sec: device.no_feedback_open_timeout_sec,
      no_feedback_unlock_until: device.no_feedback_unlock_until,
      lock_status: lockStatus,
      device_status: device.status ?? device.device_status,
      reported_device_status: device.reported_status ?? device.reported_device_status,
      status_unreachable_reason: device.status_unreachable_reason ?? null,
      battery_level: undefined,
      signal_strength: undefined,
      temperature: undefined,
      error_code: undefined,
      error_message: undefined,
      firmware_version: undefined,
      last_activity: device.last_activity,
      last_seen: device.last_seen,
      updated_at: device.updated_at,
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

      // BluLok first; fall back to access control (gates/doors) — IDs do not overlap by table.
      let deviceData: any;
      const cache = await this.reachabilityEnrichment.createLivenessCache();
      const bluLok = await this.deviceModel.findBluLokDeviceById(deviceId);
      if (bluLok) {
        const enriched = await this.reachabilityEnrichment.enrichBluLokRow(
          bluLok,
          cache,
        );
        deviceData = this.formatDeviceStatus(enriched);
      } else {
        const ac = await this.deviceModel.findAccessControlDeviceWithGateway(deviceId);
        if (!ac) {
          this.logger.warn(`Device ${deviceId} not found for broadcast`);
          return;
        }
        const enriched = await this.reachabilityEnrichment.enrichAccessControlRow(
          ac,
          cache,
        );
        deviceData = this.formatAccessControlDeviceStatus(enriched);
        if (!facilityId && ac.facility_id) {
          facilityId = ac.facility_id;
        }
      }

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
   * Re-broadcast enriched device statuses when gateway connectivity changes for a facility.
   */
  public async broadcastFacilityReachabilityRefresh(facilityId: string): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      if (activeSubscriptions.length === 0) return;

      const cache = await this.reachabilityEnrichment.createLivenessCache();
      const [blulokRows, accessRows] = await Promise.all([
        this.deviceModel.findBluLokDevices({ facility_id: facilityId }),
        this.deviceModel.findAccessControlDevices({ facility_id: facilityId }),
      ]);

      const deviceData = [
        ...(await this.reachabilityEnrichment.enrichBluLokList(blulokRows, cache)).map(
          (d) => this.formatDeviceStatus(d),
        ),
        ...(await this.reachabilityEnrichment.enrichAccessControlList(
          accessRows,
          cache,
        )).map((d) => this.formatAccessControlDeviceStatus(d)),
      ];

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        const filters = this.subscriptionFilters.get(subscriptionId);
        if (!client) continue;

        if (filters?.facilityId && filters.facilityId !== facilityId) continue;
        if (
          client.userRole !== UserRole.ADMIN &&
          client.userRole !== UserRole.DEV_ADMIN &&
          client.facilityIds &&
          client.facilityIds.length > 0 &&
          !client.facilityIds.includes(facilityId)
        ) {
          continue;
        }

        const scopedDevices =
          filters?.facilityId || filters?.deviceId
            ? deviceData.filter((d) => !filters?.deviceId || d.id === filters.deviceId)
            : deviceData;

        if (scopedDevices.length === 0 && deviceData.length > 0) continue;

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;

        watchers.forEach((ws) => {
          if (ws.readyState !== WebSocket.OPEN) {
            watchers.delete(ws);
            return;
          }
          try {
            ws.send(
              JSON.stringify({
                type: 'device_status_update',
                subscriptionId,
                data: {
                  devices: scopedDevices,
                  count: scopedDevices.length,
                  source: 'gateway_reachability_refresh',
                  facilityId,
                  lastUpdated: new Date().toISOString(),
                },
                timestamp: new Date().toISOString(),
              }),
            );
          } catch (error) {
            this.logger.error('Error sending facility reachability refresh:', error);
            watchers.delete(ws);
          }
        });
      }
    } catch (error) {
      this.logger.error('Error broadcasting facility reachability refresh:', error);
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

