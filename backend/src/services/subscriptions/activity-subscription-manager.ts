import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { ActivityLogModel } from '@/models/activity-log.model';
import { ActivityEventsService, ActivityEvent } from '@/services/events/activity-events.service';
import { AuthService } from '@/services/auth.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';

/**
 * Activity Subscription Manager
 *
 * Manages real-time subscriptions to activity log updates.
 * Provides live activity feed for units, devices, and facilities.
 *
 * Subscription Type: 'activity'
 *
 * Key Features:
 * - Real-time activity updates
 * - Facility-scoped activity feeds
 * - Unit and device-specific subscriptions
 * - Lock/unlock event notifications
 *
 * Data Provided:
 * - Recent activity logs
 * - New activities as they occur
 * - Activity type filtering
 *
 * Access Control:
 * - All authenticated users can subscribe
 * - Activity is filtered by facility access
 *
 * Subscription Parameters:
 * - facility_id: (optional) Subscribe to facility-specific activity
 * - unit_id: (optional) Subscribe to unit-specific activity
 * - device_id: (optional) Subscribe to device-specific activity
 */
export class ActivitySubscriptionManager extends BaseSubscriptionManager {
  private activityLogModel: ActivityLogModel;
  private eventService: ActivityEventsService;
  private unitModel: UnitModel;
  private deviceModel: DeviceModel;
  private initialized: boolean = false;
  private cleanupFunctions: Array<() => void> = [];
  private scopeService: AccessEventScopeService;
  // Store filters per subscription
  private subscriptionFilters: Map<string, { facilityId?: string; unitId?: string; deviceId?: string; action?: string; method?: string; denialReason?: string }> = new Map();
  private tenantUnitScopes: Map<string, string[]> = new Map();

  constructor() {
    super();
    this.activityLogModel = new ActivityLogModel();
    this.eventService = ActivityEventsService.getInstance();
    this.unitModel = new UnitModel();
    this.deviceModel = new DeviceModel();
    this.scopeService = new AccessEventScopeService();
    this.setupEventListeners();
  }

  /**
   * Clean up event listeners when the manager is destroyed
   */
  public destroy(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    this.initialized = false;
  }

  getSubscriptionType(): string {
    return 'activity';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All authenticated users can subscribe to activity
    return true;
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    // Extract filters from message data
    const filters = message.data || {};
    const facilityId = filters.facility_id || filters.facilityId;
    const unitId = filters.unit_id || filters.unitId;
    const deviceId = filters.device_id || filters.deviceId;
    const action = filters.action;
    const method = filters.method;
    const denialReason = filters.denial_reason || filters.denialReason;

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    // Validate UUID format for all IDs to prevent unnecessary database queries
    if (facilityId && !uuidValidate(facilityId)) {
      this.sendError(ws, 'Invalid facility ID format');
      return false;
    }
    if (unitId && !uuidValidate(unitId)) {
      this.sendError(ws, 'Invalid unit ID format');
      return false;
    }
    if (deviceId && !uuidValidate(deviceId)) {
      this.sendError(ws, 'Invalid device ID format');
      return false;
    }

    // Check permissions
    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    // Validate facility access if filtering by facility
    if (facilityId && !this.canAccessFacility(client.userRole, facilityId, client.facilityIds)) {
      this.sendError(ws, 'Access denied: You do not have access to this facility');
      return false;
    }

    // Validate unit access if filtering by unit
    if (unitId) {
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        this.sendError(ws, 'Unit not found');
        return false;
      }
      if (!this.canAccessFacility(client.userRole, unit.facility_id, client.facilityIds)) {
        this.sendError(ws, 'Access denied: You do not have access to this unit');
        return false;
      }

      if (client.userRole === UserRole.TENANT) {
        const tenantUnitIds = await this.scopeService.getTenantAccessibleUnitIds(client.userId);
        if (!tenantUnitIds.includes(unitId)) {
          this.sendError(ws, 'Access denied: You do not have access to this unit');
          return false;
        }
      }
    }

    // Validate device access if filtering by device
    if (deviceId) {
      // Try both device types in parallel to avoid N+1
      const [blulokDevice, accessControlDevice] = await Promise.all([
        this.deviceModel.findBluLokDeviceById(deviceId),
        this.deviceModel.findAccessControlDeviceWithGateway(deviceId),
      ]);

      let deviceFacilityId: string | null = null;
      if (blulokDevice) {
        deviceFacilityId = blulokDevice.facility_id || null;
      } else if (accessControlDevice) {
        deviceFacilityId = accessControlDevice.facility_id;
      }

      if (!deviceFacilityId) {
        this.sendError(ws, 'Device not found');
        return false;
      }
      if (!this.canAccessFacility(client.userRole, deviceFacilityId, client.facilityIds)) {
        this.sendError(ws, 'Access denied: You do not have access to this device');
        return false;
      }
    }

    // Store filters for this subscription
    this.subscriptionFilters.set(subscriptionId, { facilityId, unitId, deviceId, action, method, denialReason });
    if (client.userRole === UserRole.TENANT) {
      const tenantUnitIds = await this.scopeService.getTenantAccessibleUnitIds(client.userId);
      this.tenantUnitScopes.set(subscriptionId, tenantUnitIds);
    }

    // Store client context
    this.clientContext.set(subscriptionId, client);

    // Add to watchers
    this.addWatcher(subscriptionId, ws, client);

    // Send initial data
    await this.sendInitialData(ws, subscriptionId, client);

    this.logger.info(`📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}${facilityId ? ` (facility: ${facilityId})` : ''}${unitId ? ` (unit: ${unitId})` : ''}${deviceId ? ` (device: ${deviceId})` : ''}`);
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
    this.tenantUnitScopes.delete(subscriptionId);
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
          this.tenantUnitScopes.delete(key);
        }
      }
    });
  }

  private setupEventListeners(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for all activity events
    this.cleanupFunctions.push(
      this.eventService.onActivityLogged(async (event: ActivityEvent) => {
        await this.broadcastActivity(event);
      })
    );
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const filters = this.subscriptionFilters.get(subscriptionId);
      
      // Build query filters
      const queryFilters: any = {
        limit: 20,
        activity_type: 'access_attempt',
        sortBy: 'occurred_at',
        sortOrder: 'desc',
      };

      if (filters?.facilityId) {
        queryFilters.facility_id = filters.facilityId;
      } else if (!AuthService.canAccessAllFacilities(client.userRole)) {
        if (client.userRole === UserRole.TENANT) {
          const unitIds = this.tenantUnitScopes.get(subscriptionId) || [];
          if (unitIds.length === 0) {
            this.sendMessage(ws, {
              type: 'activity_update',
              subscriptionId,
              data: { activities: [], count: 0, lastUpdated: new Date().toISOString() },
              timestamp: new Date().toISOString(),
            });
            return;
          }
        } else if (client.facilityIds && client.facilityIds.length > 0) {
          queryFilters.facility_ids = client.facilityIds;
        }
      }

      if (filters?.unitId) {
        queryFilters.unit_id = filters.unitId;
      }

      if (filters?.deviceId) {
        queryFilters.device_id = filters.deviceId;
      }

      const activities = await this.activityLogModel.findWithContext(queryFilters);
      const filteredActivities = activities.filter((activity) => this.matchesSubscriptionFilters(activity, filters, client, subscriptionId));

      this.sendMessage(ws, {
        type: 'activity_update',
        subscriptionId,
        data: {
          activities: filteredActivities.map(a => this.formatActivity(a)),
          count: filteredActivities.length,
          lastUpdated: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error sending initial activity data:', error);
      this.sendError(ws, 'Failed to load initial activity data');
    }
  }

  /**
   * Broadcast activity event to matching subscriptions
   */
  private async broadcastActivity(event: ActivityEvent): Promise<void> {
    const activeSubscriptions = Array.from(this.watchers.keys());

    if (activeSubscriptions.length === 0) return;

    for (const subscriptionId of activeSubscriptions) {
      const client = this.clientContext.get(subscriptionId);
      const filters = this.subscriptionFilters.get(subscriptionId);
      
      if (!client) continue;
      if (event.activityType !== 'access_attempt') continue;

      // Check if this subscription should receive this activity
      // 1. If subscribed to specific facility, skip if event doesn't match
      if (filters?.facilityId) {
        if (!event.facilityId || filters.facilityId !== event.facilityId) {
          continue;
        }
      }

      // 2. If subscribed to specific unit, skip if event doesn't match
      if (filters?.unitId) {
        if (!event.unitId || filters.unitId !== event.unitId) {
          continue;
        }
      }

      // 3. If subscribed to specific device, skip if event doesn't match
      if (filters?.deviceId) {
        if (!event.deviceId || filters.deviceId !== event.deviceId) {
          continue;
        }
      }

      // 4. Check facility access for non-admin users
      if (!AuthService.canAccessAllFacilities(client.userRole)) {
        if (event.facilityId && client.facilityIds && !client.facilityIds.includes(event.facilityId)) {
          continue;
        }
      }

      // 5. Tenant-specific scope by unit or own actor
      if (client.userRole === UserRole.TENANT) {
        const unitIds = this.tenantUnitScopes.get(subscriptionId) || [];
        const hasUnitAccess = !!event.unitId && unitIds.includes(event.unitId);
        const isOwnEvent = !!event.actorId && event.actorId === client.userId;
        if (!hasUnitAccess && !isOwnEvent) {
          continue;
        }
      }

      // 6. Extra subscription metadata filters
      const subscriptionFilter = this.subscriptionFilters.get(subscriptionId);
      if (subscriptionFilter?.action || subscriptionFilter?.method || subscriptionFilter?.denialReason) {
        const eventDescription = event.description || '';
        if (subscriptionFilter.action && !eventDescription.toLowerCase().includes(subscriptionFilter.action.toLowerCase())) {
          continue;
        }
      }

      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              type: 'activity_new',
              subscriptionId,
              data: {
                activity: {
                  id: event.activityId,
                  entityType: event.entityType,
                  entityId: event.entityId,
                  activityType: event.activityType,
                  title: event.title,
                  description: event.description,
                  actor: {
                    type: event.actorType,
                    id: event.actorId,
                    name: event.actorName,
                  },
                  result: event.result,
                  facilityId: event.facilityId,
                  unitId: event.unitId,
                  deviceId: event.deviceId,
                  occurredAt: event.occurredAt.toISOString(),
                },
                timestamp: event.timestamp.toISOString(),
              },
              timestamp: new Date().toISOString(),
            }));
          } catch (error) {
            this.logger.error('Error broadcasting activity to WebSocket:', error);
          }
        }
      }
    }
  }

  /**
   * Format activity for WebSocket transmission
   */
  private formatActivity(activity: any): any {
    return {
      id: activity.id,
      entityType: activity.entity_type,
      entityId: activity.entity_id,
      activityType: activity.activity_type,
      title: activity.title,
      description: activity.description,
      actor: {
        type: activity.actor_type,
        id: activity.actor_id,
        name: activity.actor_name,
      },
      result: activity.result,
      resultMessage: activity.result_message,
      facilityId: activity.facility_id,
      unitId: activity.unit_id,
      deviceId: activity.device_id,
      unitNumber: activity.unit_number,
      deviceSerial: activity.device_serial,
      facilityName: activity.facility_name,
      occurredAt: activity.occurred_at,
    };
  }

  private matchesSubscriptionFilters(
    activity: any,
    filters: { action?: string; method?: string; denialReason?: string } | undefined,
    client: SubscriptionClient,
    subscriptionId: string,
  ): boolean {
    const metadata = activity.metadata && typeof activity.metadata === 'object' ? activity.metadata : {};
    const action = typeof metadata.action === 'string' ? metadata.action : undefined;
    const method = typeof metadata.method === 'string' ? metadata.method : undefined;
    const denialReason = typeof metadata.denial_reason === 'string' ? metadata.denial_reason : undefined;

    if (filters?.action && action !== filters.action) return false;
    if (filters?.method && method !== filters.method) return false;
    if (filters?.denialReason && denialReason !== filters.denialReason) return false;

    if (client.userRole === UserRole.TENANT) {
      const unitIds = this.tenantUnitScopes.get(subscriptionId) || [];
      const hasUnitAccess = !!activity.unit_id && unitIds.includes(activity.unit_id);
      const isOwnEvent = !!activity.actor_id && activity.actor_id === client.userId;
      return hasUnitAccess || isOwnEvent;
    }

    if (client.userRole === UserRole.MAINTENANCE) {
      return !!activity.actor_id && activity.actor_id === client.userId;
    }

    return true;
  }

  /**
   * Check if user can access a facility
   */
  private canAccessFacility(
    userRole: UserRole,
    facilityId: string,
    userFacilityIds: string[] | undefined
  ): boolean {
    if (AuthService.canAccessAllFacilities(userRole)) {
      return true;
    }
    return userFacilityIds?.includes(facilityId) || false;
  }

  /**
   * Broadcast update for general refresh
   */
  public async broadcastUpdate(): Promise<void> {
    // Not needed for activity - we use event-driven updates
  }
}
