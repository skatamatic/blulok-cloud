import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { NotificationModel } from '@/models/notification.model';
import { DeviceModel } from '@/models/device.model';
import { GatewayModel } from '@/models/gateway.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitsService } from '@/services/units.service';
import { AccessCodeService } from '@/services/access-code.service';
import { ActivityService } from '@/services/activity.service';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { ActivityEventsService, ActivityEvent } from '@/services/events/activity-events.service';
import {
  canViewNotificationType,
  excludedNotificationTypesForRole,
} from '@/utils/in-app-notification-visibility.utils';
import { AuthService } from '@/services/auth.service';
import {
  assertAppFacilityAccess,
  canReceiveActivityOnAppStream,
  canReceiveDeviceOnAppStream,
  canReceiveUnitsUpdateOnAppStream,
  getAccessibleUnitIdsForFacility,
} from '@/services/app-realtime.scope';
import type {
  AppEventEnvelope,
  AppRealtimeClient,
  AppRealtimeEventName,
  AppRealtimeSubscriber,
  AppUnitsUpdateScope,
} from '@/services/app-realtime.types';

/**
 * Multiplexed app realtime fanout for `/ws/app`.
 * Holds facility-scoped subscribers and delivers RBAC-filtered events.
 */
export class AppRealtimeHub {
  private static instance: AppRealtimeHub;
  /** Initial snapshot / list-replace slices stay small; clients page via REST for more. */
  private static readonly APP_LIST_LIMIT = 10;
  private subscribers = new Map<WebSocket, AppRealtimeSubscriber>();
  private notificationModel = new NotificationModel();
  private deviceModel = new DeviceModel();
  private gatewayModel = new GatewayModel();
  private keySharingModel = new KeySharingModel();
  private unitsService = UnitsService.getInstance();
  private accessCodeService = AccessCodeService.getInstance();
  private activityService = ActivityService.getInstance();
  private reachability = DeviceReachabilityEnrichmentService.getInstance();
  private cleanupFns: Array<() => void> = [];
  private listenersReady = false;

  public static getInstance(): AppRealtimeHub {
    if (!AppRealtimeHub.instance) {
      AppRealtimeHub.instance = new AppRealtimeHub();
    }
    return AppRealtimeHub.instance;
  }

  public ensureListeners(): void {
    if (this.listenersReady) return;
    this.listenersReady = true;
    const notifications = NotificationEventsService.getInstance();
    const activity = ActivityEventsService.getInstance();

    this.cleanupFns.push(
      notifications.onNotificationCreated(async (event) => {
        await this.emitToUser(event.userId, 'notification_created', {
          notificationId: event.notificationId,
          type: event.notificationType,
          title: event.title,
          message: event.message,
          priority: event.priority,
          facilityId: event.facilityId,
          reference: event.reference,
          metadata: event.metadata ?? null,
          timestamp: event.timestamp.toISOString(),
        }, event.facilityId, (client) => canViewNotificationType(client.userRole, event.notificationType));
        await this.emitUnreadCount(event.userId, event.facilityId);
      }),
    );

    this.cleanupFns.push(
      notifications.onNotificationRead(async (event) => {
        await this.emitToUser(event.userId, 'notification_read', {
          notificationId: event.notificationId,
          readAt: event.readAt.toISOString(),
        }, event.facilityId);
        await this.emitUnreadCount(event.userId, event.facilityId);
      }),
    );

    this.cleanupFns.push(
      notifications.onNotificationDeleted(async (event) => {
        await this.emitToUser(event.userId, 'notification_deleted', {
          notificationId: event.notificationId,
          timestamp: event.timestamp.toISOString(),
        }, event.facilityId);
        await this.emitUnreadCount(event.userId, event.facilityId);
      }),
    );

    this.cleanupFns.push(
      notifications.onBatchRead(async (event) => {
        await this.emitToUser(event.userId, 'notifications_batch_read', {
          notificationIds: event.notificationIds,
          facilityId: event.facilityId,
          facilityIds: event.facilityIds,
          timestamp: event.timestamp.toISOString(),
        }, event.facilityId);
        await this.emitUnreadCount(event.userId, event.facilityId);
      }),
    );

    this.cleanupFns.push(
      notifications.onBatchHidden(async (event) => {
        await this.emitToUser(event.userId, 'notifications_batch_hidden', {
          facilityId: event.facilityId,
          facilityIds: event.facilityIds,
          timestamp: event.timestamp.toISOString(),
        }, event.facilityId);
        await this.emitUnreadCount(event.userId, event.facilityId);
      }),
    );

    this.cleanupFns.push(
      activity.onActivityLogged(async (event: ActivityEvent) => {
        await this.emitActivityNew(event);
      }),
    );
  }

  public destroy(): void {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.listenersReady = false;
    this.subscribers.clear();
    AppRealtimeHub.instance = undefined as unknown as AppRealtimeHub;
  }

  public getSubscriberCount(): number {
    return this.subscribers.size;
  }

  public removeSubscriber(ws: WebSocket): void {
    this.subscribers.delete(ws);
  }

  public getSubscriber(ws: WebSocket): AppRealtimeSubscriber | undefined {
    return this.subscribers.get(ws);
  }

  /**
   * Validate facility access, register subscriber, send snapshot.
   */
  public async subscribe(
    ws: WebSocket,
    client: AppRealtimeClient,
    facilityId: string,
    subscriptionId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    this.ensureListeners();

    const access = await assertAppFacilityAccess(client.userId, client.userRole, facilityId);
    if (!access.ok) {
      return access;
    }

    const accessibleUnitIds = await getAccessibleUnitIdsForFacility(
      client.userId,
      client.userRole,
      facilityId,
    );

    client.subscriptionId = subscriptionId;
    client.facilityId = facilityId;
    client.accessibleUnitIds = accessibleUnitIds;

    this.subscribers.set(ws, { ws, client });

    try {
      const snapshot = await this.buildSnapshot(client);
      this.sendAppEvent(ws, client, 'app_snapshot', snapshot);
    } catch (error) {
      logger.error('[AppRealtime] Failed to build snapshot:', error);
      this.subscribers.delete(ws);
      client.subscriptionId = undefined;
      client.facilityId = undefined;
      client.accessibleUnitIds = undefined;
      return { ok: false, error: 'Failed to load app snapshot' };
    }

    return { ok: true };
  }

  public unsubscribe(ws: WebSocket, client: AppRealtimeClient): void {
    client.subscriptionId = undefined;
    client.facilityId = undefined;
    client.accessibleUnitIds = undefined;
    this.subscribers.delete(ws);
  }

  public async emitDeviceStatusUpdate(deviceId: string, facilityId?: string): Promise<void> {
    if (this.subscribers.size === 0) return;

    let device: Record<string, unknown> | null = null;
    try {
      const cache = await this.reachability.createLivenessCache();
      const bluLok = await this.deviceModel.findBluLokDeviceById(deviceId);
      if (bluLok) {
        const enriched = await this.reachability.enrichBluLokRow(bluLok, cache);
        device = this.formatBluLokDevice(enriched);
      } else {
        const access = await this.deviceModel.findAccessControlDeviceById(deviceId);
        if (access) {
          const enriched = await this.reachability.enrichAccessControlRow(access, cache);
          device = this.formatAccessControlDevice(enriched);
        }
      }
    } catch (error) {
      logger.error('[AppRealtime] Failed to load device for fanout:', error);
      return;
    }

    if (!device) return;
    const deviceFacilityId = String(device.facility_id || facilityId || '');
    if (!deviceFacilityId) return;

    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || client.facilityId !== deviceFacilityId) continue;
      if (!canReceiveDeviceOnAppStream(client, device as { facility_id?: string; unit_id?: string })) {
        continue;
      }
      this.sendAppEvent(ws, client, 'device_status_update', {
        devices: [device],
        count: 1,
        updatedDeviceId: deviceId,
        facilityId: deviceFacilityId,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  public async emitUnitsUpdate(scope?: AppUnitsUpdateScope): Promise<void> {
    if (this.subscribers.size === 0) return;

    const resolved = await this.resolveUnitsUpdateScope(scope);
    if (scope?.deviceId && resolved.deviceMissing) {
      // Device gone and no explicit facility/unit — cannot safely scope; skip app fanout.
      if (!resolved.facilityId && resolved.unitId === undefined) return;
    }

    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || !client.facilityId) continue;
      if (!canReceiveUnitsUpdateOnAppStream(client, resolved)) continue;
      try {
        const units = await this.buildUnitsPayload(client);
        this.sendAppEvent(ws, client, 'units_update', units);
      } catch (error) {
        logger.error('[AppRealtime] units_update fanout failed:', error);
      }
    }
  }

  /**
   * Resolve facility/unit for units_update from optional device lookup.
   * `unitId: undefined` = unknown / facility-wide; `null` = known no unit.
   */
  private async resolveUnitsUpdateScope(
    scope?: AppUnitsUpdateScope,
  ): Promise<{ facilityId?: string; unitId?: string | null; deviceMissing?: boolean }> {
    let facilityId = scope?.facilityId;
    let unitId: string | null | undefined = scope?.unitId;

    if (!scope?.deviceId || (facilityId && unitId !== undefined)) {
      return { facilityId, unitId };
    }

    try {
      const bluLok = await this.deviceModel.findBluLokDeviceById(scope.deviceId);
      if (bluLok) {
        return {
          facilityId: facilityId ?? (bluLok.facility_id ? String(bluLok.facility_id) : undefined),
          unitId: unitId !== undefined ? unitId : (bluLok.unit_id ? String(bluLok.unit_id) : null),
        };
      }
      const access = await this.deviceModel.findAccessControlDeviceWithGateway(scope.deviceId);
      if (access) {
        return {
          facilityId: facilityId ?? (access.facility_id ? String(access.facility_id) : undefined),
          unitId: unitId !== undefined ? unitId : null,
        };
      }
      return { facilityId, unitId, deviceMissing: true };
    } catch (error) {
      logger.error('[AppRealtime] Failed to resolve units_update scope from device:', error);
      return { facilityId, unitId, deviceMissing: true };
    }
  }

  public async emitGatewayStatusUpdate(facilityId?: string, gatewayId?: string): Promise<void> {
    if (this.subscribers.size === 0) return;
    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || !client.facilityId) continue;
      if (facilityId && client.facilityId !== facilityId) continue;
      try {
        const gateways = await this.gatewayModel.findBoundGatewaysWithContext({
          facility_id: client.facilityId,
        });
        const rows = gateways.map((g) => ({
          id: g.id,
          facilityId: g.facility_id,
          name: g.name,
          status: g.status,
          lastSeen: g.last_seen,
          connected: null,
          lastActivityAt: g.last_seen,
        }));
        this.sendAppEvent(ws, client, 'gateway_status_update', {
          gateways: rows,
          updatedGatewayId: gatewayId,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[AppRealtime] gateway_status_update fanout failed:', error);
      }
    }
  }

  public async emitAccessCodesUpdate(facilityId?: string): Promise<void> {
    if (this.subscribers.size === 0) return;
    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || !client.facilityId) continue;
      if (facilityId && client.facilityId !== facilityId) continue;
      try {
        const codes = await this.accessCodeService.getAppCodesForUser(
          client.userId,
          client.userRole,
          client.facilityIds,
          client.facilityId,
        );
        this.sendAppEvent(ws, client, 'access_codes_update', {
          codes,
          count: codes.length,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[AppRealtime] access_codes_update fanout failed:', error);
      }
    }
  }

  public async emitKeySharingUpdate(facilityId?: string): Promise<void> {
    if (this.subscribers.size === 0) return;
    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || !client.facilityId) continue;
      if (facilityId && client.facilityId !== facilityId) continue;
      try {
        const payload = await this.buildKeySharingPayload(client);
        this.sendAppEvent(ws, client, 'key_sharing_update', payload);
      } catch (error) {
        logger.error('[AppRealtime] key_sharing_update fanout failed:', error);
      }
    }
  }

  private async emitActivityNew(event: ActivityEvent): Promise<void> {
    if (this.subscribers.size === 0) return;
    const activity = {
      id: event.activityId,
      entityType: event.entityType,
      entityId: event.entityId,
      activityType: event.activityType,
      title: event.title,
      description: event.description,
      actor: { type: event.actorType, id: event.actorId, name: event.actorName },
      result: event.result,
      facilityId: event.facilityId,
      unitId: event.unitId,
      deviceId: event.deviceId,
      occurredAt: event.occurredAt.toISOString(),
    };

    for (const { ws, client } of this.subscribers.values()) {
      if (!client.subscriptionId || !client.facilityId) continue;
      if (!canReceiveActivityOnAppStream(client, activity)) continue;
      this.sendAppEvent(ws, client, 'activity_new', {
        activity,
        accessLog: null,
        timestamp: event.timestamp.toISOString(),
      });
    }
  }

  private async emitToUser(
    userId: string,
    event: AppRealtimeEventName,
    data: unknown,
    facilityId?: string,
    extraFilter?: (client: AppRealtimeClient) => boolean,
  ): Promise<void> {
    for (const { ws, client } of this.subscribers.values()) {
      if (client.userId !== userId || !client.subscriptionId || !client.facilityId) continue;
      if (facilityId && facilityId !== client.facilityId) continue;
      if (extraFilter && !extraFilter(client)) continue;
      this.sendAppEvent(ws, client, event, data);
    }
  }

  private async emitUnreadCount(userId: string, facilityId?: string): Promise<void> {
    for (const { ws, client } of this.subscribers.values()) {
      if (client.userId !== userId || !client.subscriptionId || !client.facilityId) continue;
      if (facilityId && facilityId !== client.facilityId) continue;
      try {
        const excludedTypes = excludedNotificationTypesForRole(client.userRole);
        const unreadCount = await this.notificationModel.getUnreadCount(client.userId, {
          facilityId: client.facilityId,
          excludeNotificationTypes: excludedTypes.length > 0 ? excludedTypes : undefined,
        });
        this.sendAppEvent(ws, client, 'notifications_count_update', {
          unreadCount,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[AppRealtime] unread count fanout failed:', error);
      }
    }
  }

  private async buildSnapshot(client: AppRealtimeClient): Promise<Record<string, unknown>> {
    const facilityId = client.facilityId!;
    const excludedTypes = excludedNotificationTypesForRole(client.userRole);
    const excludeNotificationTypes = excludedTypes.length > 0 ? excludedTypes : undefined;

    const [
      unreadCount,
      recentNotifications,
      devices,
      units,
      activityResult,
      codes,
      keySharing,
      gateways,
    ] = await Promise.all([
      this.notificationModel.getUnreadCount(client.userId, {
        facilityId,
        excludeNotificationTypes,
      }),
      this.notificationModel.find({
        user_id: client.userId,
        facility_id: facilityId,
        include_expired: false,
        exclude_notification_types: excludeNotificationTypes,
        limit: AppRealtimeHub.APP_LIST_LIMIT,
        sortBy: 'created_at',
        sortOrder: 'desc',
      }),
      this.loadDevicesForClient(client),
      this.buildUnitsPayload(client),
      this.activityService.getActivityLogs(
        client.userId,
        client.userRole,
        client.facilityIds,
        { facilityId, limit: AppRealtimeHub.APP_LIST_LIMIT, offset: 0 },
      ).catch(() => ({ activities: [], total: 0 })),
      this.accessCodeService.getAppCodesForUser(
        client.userId,
        client.userRole,
        client.facilityIds,
        facilityId,
      ),
      this.buildKeySharingPayload(client),
      this.gatewayModel.findBoundGatewaysWithContext({ facility_id: facilityId }),
    ]);

    return {
      facilityId,
      notifications: {
        unreadCount,
        recentNotifications: recentNotifications.map((n) => ({
          id: n.id,
          type: n.notification_type,
          title: n.title,
          message: n.message,
          priority: n.priority,
          isRead: n.is_read,
          readAt: n.read_at,
          facilityId: n.facility_id,
          reference: n.reference_type && n.reference_id
            ? { type: n.reference_type, id: n.reference_id }
            : null,
          metadata: n.metadata ?? null,
          createdAt: n.created_at,
        })),
      },
      devices,
      units,
      activity: {
        activities: activityResult.activities ?? [],
        count: activityResult.total ?? 0,
      },
      accessCodes: {
        codes,
        count: codes.length,
      },
      keySharing,
      gateways: gateways.map((g) => ({
        id: g.id,
        facilityId: g.facility_id,
        name: g.name,
        status: g.status,
        lastSeen: g.last_seen,
        connected: null,
        lastActivityAt: g.last_seen,
      })),
      lastUpdated: new Date().toISOString(),
    };
  }

  private async loadDevicesForClient(client: AppRealtimeClient): Promise<unknown[]> {
    const facilityId = client.facilityId!;
    const cache = await this.reachability.createLivenessCache();
    const [bluloks, accessControls] = await Promise.all([
      this.deviceModel.findBluLokDevices({ facility_id: facilityId }),
      this.deviceModel.findAccessControlDevices({ facility_id: facilityId }),
    ]);

    const enrichedBluLok = await Promise.all(
      bluloks.map((d) => this.reachability.enrichBluLokRow(d, cache)),
    );
    const enrichedAccess = await Promise.all(
      accessControls.map((d) => this.reachability.enrichAccessControlRow(d, cache)),
    );

    const formatted = [
      ...enrichedBluLok.map((d) => this.formatBluLokDevice(d)),
      ...enrichedAccess.map((d) => this.formatAccessControlDevice(d)),
    ];

    return formatted.filter((d) =>
      canReceiveDeviceOnAppStream(client, d as { facility_id?: string; unit_id?: string }),
    );
  }

  private async buildUnitsPayload(client: AppRealtimeClient): Promise<Record<string, unknown>> {
    const allUnitsResult = await this.unitsService.getUnits(client.userId, client.userRole, {
      facility_id: client.facilityId,
    });
    const allUnits = allUnitsResult.units ?? [];
    const unlockedUnits = allUnits.filter((u: { is_locked?: boolean }) => u.is_locked === false);
    // Snapshot/live units slice: counts + compact unlocked rows (ids/numbers), not full unit documents.
    const unlockedSummary = unlockedUnits.map((u: {
      id?: string;
      unit_number?: string;
      facility_id?: string;
      status?: string;
      is_locked?: boolean;
    }) => ({
      id: u.id,
      unit_number: u.unit_number,
      facility_id: u.facility_id,
      status: u.status,
      is_locked: u.is_locked,
    }));
    return {
      unlockedUnits: unlockedSummary,
      totalUnits: allUnits.length,
      occupiedUnits: allUnits.filter((u: { status?: string }) => u.status === 'occupied').length,
      availableUnits: allUnits.filter((u: { status?: string }) => u.status === 'available').length,
      maintenanceUnits: allUnits.filter((u: { status?: string }) => u.status === 'maintenance').length,
      reservedUnits: allUnits.filter((u: { status?: string }) => u.status === 'reserved').length,
      unlockedCount: unlockedUnits.length,
      lockedCount: allUnits.length - unlockedUnits.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async buildKeySharingPayload(client: AppRealtimeClient): Promise<Record<string, unknown>> {
    // Active shares only — full entitled set (who the user is sharing with / shared to).
    const filters: Record<string, unknown> = {
      is_active: true,
      limit: 200,
      offset: 0,
      sort_by: 'shared_at',
      sort_order: 'desc',
      facility_ids: [client.facilityId!],
    };

    if (AuthService.isAdmin(client.userRole) || AuthService.isFacilityAdmin(client.userRole)) {
      // facility_ids already set
    } else if (client.userRole === UserRole.TENANT) {
      filters.primary_tenant_id = client.userId;
    } else if (client.userRole === UserRole.MAINTENANCE) {
      filters.shared_with_user_id = client.userId;
    }

    const result = await this.keySharingModel.findAll(filters as any);
    return {
      sharings: result.sharings,
      total: result.total,
      lastUpdated: new Date().toISOString(),
    };
  }

  private formatBluLokDevice(device: any): Record<string, unknown> {
    const deviceSettings =
      device.device_settings && typeof device.device_settings === 'object'
        ? device.device_settings
        : undefined;
    const displayName =
      deviceSettings && typeof deviceSettings.displayName === 'string'
        ? deviceSettings.displayName
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
      firmware_version: device.firmware_version,
      last_activity: device.last_activity,
      last_seen: device.last_seen,
      updated_at: device.updated_at,
    };
  }

  private formatAccessControlDevice(device: any): Record<string, unknown> {
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
      lock_status: Boolean(device.is_locked) ? 'locked' : 'unlocked',
      device_status: device.status ?? device.device_status,
      reported_device_status: device.reported_status ?? device.reported_device_status,
      status_unreachable_reason: device.status_unreachable_reason ?? null,
      last_activity: device.last_activity,
      last_seen: device.last_seen,
      updated_at: device.updated_at,
    };
  }

  private sendAppEvent(
    ws: WebSocket,
    client: AppRealtimeClient,
    event: AppRealtimeEventName,
    data: unknown,
  ): void {
    if (ws.readyState !== WebSocket.OPEN || !client.subscriptionId || !client.facilityId) return;
    const envelope: AppEventEnvelope = {
      type: 'app_event',
      subscriptionId: client.subscriptionId,
      facilityId: client.facilityId,
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    try {
      ws.send(JSON.stringify(envelope));
    } catch (error) {
      logger.error('[AppRealtime] Failed to send app_event:', error);
    }
  }
}
