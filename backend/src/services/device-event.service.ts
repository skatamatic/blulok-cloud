import { EventEmitter } from 'events';
import { WebSocketService } from './websocket.service';
import { logger } from '@/utils/logger';
import {
  isLoggableLockStatusTransition,
  lockActivityTitle,
  lockActivityVerb,
  mapLockStatusToActivityType,
} from '@/utils/lock-status-activity.utils';
import {
  resolveRemoteAccessMethod,
  terminalActivityMatchesRequestedStatus,
} from '@/utils/access-history-remote.utils';

/**
 * Device Event Types
 *
 * Defines the lifecycle events emitted by devices in the BluLok system.
 * These events drive real-time updates and maintain system state consistency.
 */
export enum DeviceEvent {
  /** Device connectivity or operational status changed */
  DEVICE_STATUS_CHANGED = 'deviceStatusChanged',
  /** Lock mechanism state transitioned (locked/unlocked/error) */
  LOCK_STATUS_CHANGED = 'lockStatusChanged',
  /** Device telemetry updated (battery, signal, temperature, etc.) */
  DEVICE_TELEMETRY_UPDATED = 'deviceTelemetryUpdated',
  /** New device discovered and registered in the system */
  DEVICE_ADDED = 'deviceAdded',
  /** Device removed or decommissioned from the system */
  DEVICE_REMOVED = 'deviceRemoved',
  /** Device assigned to a unit */
  DEVICE_ASSIGNED = 'deviceAssigned',
  /** Device unassigned from a unit */
  DEVICE_UNASSIGNED = 'deviceUnassigned'
}

/**
 * Device Status Changed Event Interface
 *
 * Emitted when a device's operational status changes (online/offline/error/maintenance).
 * Triggers battery status and connectivity monitoring updates.
 */
export interface DeviceStatusChangedEvent {
  /** Unique device identifier */
  deviceId: string;
  /** Type of device (blulok lock or access control device) */
  deviceType: 'blulok' | 'access_control';
  /** Previous device status */
  oldStatus: string;
  /** New device status */
  newStatus: string;
  /** Gateway managing this device */
  gatewayId: string;
}

/**
 * Lock Status Changed Event Interface
 *
 * Emitted when a lock's physical state changes. This is critical for
 * security monitoring and real-time occupancy tracking.
 */
export interface LockStatusChangedEvent {
  /** Lock device identifier */
  deviceId: string;
  /** Previous lock state */
  oldStatus: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  /** New lock state */
  newStatus: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  /** Gateway managing this lock */
  gatewayId: string;
  /** Unit this lock secures */
  unitId: string;
}

/**
 * Device Added Event Interface
 *
 * Emitted when a new device is discovered and registered in the system.
 * Used for device inventory management and automatic configuration.
 */
export interface DeviceAddedEvent {
  /** Newly added device identifier */
  deviceId: string;
  /** Type of device added */
  deviceType: 'blulok' | 'access_control';
  /** Gateway managing the new device */
  gatewayId: string;
  /** Unit the device is associated with (if applicable) */
  unitId?: string;
}

/**
 * Device Removed Event Interface
 *
 * Emitted when a device is removed or decommissioned from the system.
 * Triggers cleanup and access control updates.
 */
export interface DeviceRemovedEvent {
  /** Device being removed */
  deviceId: string;
  /** Type of device being removed */
  deviceType: 'blulok' | 'access_control';
  /** Gateway that was managing the device */
  gatewayId: string;
  /** Facility containing the device (preferred for fanout after delete) */
  facilityId?: string;
  /** Unit the device was assigned to, if any */
  unitId?: string | null;
}

/**
 * Device Assigned Event Interface
 *
 * Emitted when a device is assigned to a unit.
 * Triggers unit updates and access control synchronization.
 */
export interface DeviceAssignedEvent {
  /** Device being assigned */
  deviceId: string;
  /** Unit the device is being assigned to */
  unitId: string;
  /** Facility containing the unit */
  facilityId: string;
  /** Additional event metadata */
  metadata?: {
    source?: 'manual' | 'fms_sync' | 'api';
    performedBy?: string;
  };
}

/**
 * Device Unassigned Event Interface
 *
 * Emitted when a device is unassigned from a unit.
 * Triggers unit updates and makes device available for other assignments.
 */
export interface DeviceUnassignedEvent {
  /** Device being unassigned */
  deviceId: string;
  /** Unit the device was assigned to */
  unitId: string;
  /** Facility containing the unit */
  facilityId: string;
  /** Additional event metadata */
  metadata?: {
    source?: 'manual' | 'fms_sync' | 'api';
    performedBy?: string;
    reason?: 'manual' | 'reassigned' | 'unit_deleted' | 'inventory_removed';
  };
}

/**
 * Device Telemetry Updated Event Interface
 *
 * Emitted when a device's telemetry data changes (battery, signal, temperature, etc.).
 * Triggers real-time updates to device status subscribers.
 */
export interface DeviceTelemetryUpdatedEvent {
  /** Device identifier */
  deviceId: string;
  /** Gateway managing this device */
  gatewayId?: string;
  /** Facility containing the device */
  facilityId?: string;
}

/**
 * Device Event Service
 *
 * Event-driven service that manages device lifecycle events and coordinates
 * real-time broadcasting to maintain system state consistency across clients.
 *
 * Key Features:
 * - Decoupled architecture separating device operations from WebSocket broadcasting
 * - Event-driven updates for lock status, device connectivity, and battery monitoring
 * - Automatic triggering of subscription manager broadcasts
 * - Graceful initialization to avoid database dependency issues during startup
 *
 * Event Flow:
 * 1. Device operations emit events through this service
 * 2. Service listeners trigger appropriate WebSocket broadcasts
 * 3. Subscription managers deliver real-time updates to clients
 */
export class DeviceEventService extends EventEmitter {
  private static instance: DeviceEventService;
  private wsService?: WebSocketService;

  private constructor() {
    super();
    // Defer WebSocketService initialization to avoid database dependency during startup
  }

  public static getInstance(): DeviceEventService {
    if (!DeviceEventService.instance) {
      DeviceEventService.instance = new DeviceEventService();
    }
    return DeviceEventService.instance;
  }

  /**
   * Initialize the service after database is ready
   */
  public initialize(): void {
    if (!this.wsService) {
      this.wsService = WebSocketService.getInstance();
      this.setupEventListeners();
    }
  }

  /**
   * Setup event listeners for broadcasting
   */
  private setupEventListeners(): void {
    // Broadcast units update and device status update when lock status changes
    this.on(DeviceEvent.LOCK_STATUS_CHANGED, async (event: LockStatusChangedEvent) => {
      try {
        if (this.wsService) {
          await this.wsService.broadcastUnitsUpdate({
            unitId: event.unitId || null,
            deviceId: event.deviceId,
          });
          // Also broadcast device status update for the specific device
          await this.wsService.broadcastDeviceStatusUpdate(event.deviceId);
        } else {
          console.warn('WebSocketService not initialized, skipping units update broadcast');
        }
      } catch (error) {
        console.error('Failed to broadcast units update:', error);
      }

      // Log activity for lock status changes (settled and in-flight remote/gateway commands)
      if (isLoggableLockStatusTransition(event.newStatus)) {
        this.logLockActivity(event).catch(err =>
          logger.error('Failed to log lock activity:', err)
        );
      }
    });

    // Broadcast updates when device status changes (online/offline)
    // This affects units display (device availability) and battery monitoring
    this.on(DeviceEvent.DEVICE_STATUS_CHANGED, async (event: DeviceStatusChangedEvent) => {
      try {
        if (this.wsService) {
          // Device status changes affect units display (device online/offline)
          await this.wsService.broadcastUnitsUpdate({ deviceId: event.deviceId });
          // Battery status updates affect battery monitoring
          await this.wsService.broadcastBatteryStatusUpdate();
          // Also broadcast device status update for the specific device
          await this.wsService.broadcastDeviceStatusUpdate(event.deviceId);
        } else {
          console.warn('WebSocketService not initialized, skipping device status update broadcast');
        }
      } catch (error) {
        console.error('Failed to broadcast device status update:', error);
      }

      // Log activity for device status changes
      this.logDeviceStatusActivity(event).catch(err =>
        logger.error('Failed to log device status activity:', err)
      );
    });

    this.on(DeviceEvent.DEVICE_UNASSIGNED, async (event: DeviceUnassignedEvent) => {
      try {
        if (this.wsService) {
          await this.wsService.broadcastUnitsUpdate({
            facilityId: event.facilityId,
            unitId: event.unitId,
            deviceId: event.deviceId,
          });
        }
      } catch (error) {
        console.error('Failed to broadcast units update after device unassigned:', error);
      }
    });

    this.on(DeviceEvent.DEVICE_REMOVED, async (event: DeviceRemovedEvent) => {
      try {
        if (this.wsService) {
          await this.wsService.broadcastUnitsUpdate({
            facilityId: event.facilityId,
            unitId: event.unitId,
            deviceId: event.deviceId,
          });
        }
      } catch (error) {
        console.error('Failed to broadcast units update after device removed:', error);
      }
    });

    // Broadcast updates when telemetry changes (battery, signal, temperature, errors)
    // Low battery and error states affect unit display
    this.on(DeviceEvent.DEVICE_TELEMETRY_UPDATED, async (event: DeviceTelemetryUpdatedEvent) => {
      try {
        if (this.wsService) {
          // Telemetry updates may affect units display (low battery alerts, errors)
          await this.wsService.broadcastUnitsUpdate({
            facilityId: event.facilityId,
            deviceId: event.deviceId,
          });
          // Telemetry updates affect device status and battery monitoring
          await this.wsService.broadcastDeviceStatusUpdate(event.deviceId, event.facilityId);
          await this.wsService.broadcastBatteryStatusUpdate();
        } else {
          console.warn('WebSocketService not initialized, skipping telemetry update broadcast');
        }
      } catch (error) {
        console.error('Failed to broadcast telemetry update:', error);
      }
    });
  }

  /**
   * Emit device status changed event
   */
  public emitDeviceStatusChanged(event: DeviceStatusChangedEvent): void {
    this.emit(DeviceEvent.DEVICE_STATUS_CHANGED, event);
  }

  /**
   * Emit lock status changed event
   */
  public emitLockStatusChanged(event: LockStatusChangedEvent): void {
    this.emit(DeviceEvent.LOCK_STATUS_CHANGED, event);
  }

  /**
   * Emit device added event
   */
  public emitDeviceAdded(event: DeviceAddedEvent): void {
    this.emit(DeviceEvent.DEVICE_ADDED, event);
  }

  /**
   * Emit device removed event
   */
  public emitDeviceRemoved(event: DeviceRemovedEvent): void {
    this.emit(DeviceEvent.DEVICE_REMOVED, event);
  }

  /**
   * Emit device assigned event
   */
  public emitDeviceAssigned(event: DeviceAssignedEvent): void {
    this.emit(DeviceEvent.DEVICE_ASSIGNED, event);
  }

  /**
   * Emit device unassigned event
   */
  public emitDeviceUnassigned(event: DeviceUnassignedEvent): void {
    this.emit(DeviceEvent.DEVICE_UNASSIGNED, event);
  }

  /**
   * Emit device telemetry updated event
   */
  public emitDeviceTelemetryUpdated(event: DeviceTelemetryUpdatedEvent): void {
    this.emit(DeviceEvent.DEVICE_TELEMETRY_UPDATED, event);
  }

  // ============================================
  // Activity logging helpers
  // ============================================

  /**
   * Log terminal lock/unlock activity when gateway state sync reports a settled status.
   */
  private async logLockActivity(event: LockStatusChangedEvent): Promise<void> {
    const { ActivityService } = await import('@/services/activity.service');
    const { DeviceModel } = await import('@/models/device.model');
    const { LockCommandService } = await import('@/services/lock-command.service');

    const lockCommandService = LockCommandService.getInstance();
    if (lockCommandService.consumeSuppressRevertActivityLog(event.deviceId)) {
      return;
    }

    const deviceModel = new DeviceModel();
    const gateway = await deviceModel.findGatewayById(event.gatewayId);
    if (!gateway) {
      logger.warn(`Cannot log lock activity: gateway ${event.gatewayId} not found`);
      return;
    }

    const blulokDevice = await deviceModel.findBluLokDeviceById(event.deviceId);
    const acDevice = blulokDevice ? null : await deviceModel.findAccessControlDeviceWithGateway(event.deviceId);
    const deviceType = acDevice && !blulokDevice ? 'access_control' : 'blulok';
    const unitId = event.unitId || blulokDevice?.unit_id || undefined;

    const activityType = mapLockStatusToActivityType(event.newStatus);
    if (!activityType || activityType === 'locking' || activityType === 'unlocking') {
      return;
    }

    const attribution = lockCommandService.peekCommandAttribution(event.deviceId);
    const remoteMethod = attribution
      ? resolveRemoteAccessMethod(attribution.initiator.role)
      : undefined;
    const isRealTransition = event.oldStatus !== event.newStatus;
    const statusMatchesRequested = Boolean(
      attribution
      && terminalActivityMatchesRequestedStatus(activityType, attribution.requestedStatus),
    );

    if (
      attribution
      && remoteMethod
      && !statusMatchesRequested
    ) {
      lockCommandService.recordRemoteCommandSettlementMismatch({
        deviceId: event.deviceId,
        facilityId: gateway.facility_id,
        unitId,
        gatewayId: event.gatewayId,
        deviceType,
        requestedStatus: attribution.requestedStatus,
        message:
          attribution.requestedStatus === 'unlocked'
            ? 'Remote unlock failed: device remained locked'
            : 'Remote lock failed: device remained unlocked',
      });
      return;
    }

    // Same-state re-report: clear matching pending command so one-shot TTL does not
    // false-fail, but never write a success activity (no physical transition).
    if (!isRealTransition) {
      if (attribution && remoteMethod && statusMatchesRequested) {
        lockCommandService.tryConsumeAttribution(event.deviceId, {
          commandId: attribution.commandId,
          requestedStatus: attribution.requestedStatus,
        });
      }
      return;
    }

    // Success attribution only on a real status transition.
    let appliedRemoteAttribution = null as ReturnType<typeof lockCommandService.peekCommandAttribution>;
    if (attribution && remoteMethod && statusMatchesRequested) {
      appliedRemoteAttribution = lockCommandService.tryConsumeAttribution(event.deviceId, {
        commandId: attribution.commandId,
        requestedStatus: attribution.requestedStatus,
      });
    }

    // On-ground occupied override: brief window after access-event consumed the intent.
    let occupiedStateAttr: {
      userId: string;
      userName: string;
      role: string;
      override: { reason: string; reasonLabel: string; notes?: string };
    } | null = null;
    if (!appliedRemoteAttribution && activityType === 'unlock' && isRealTransition) {
      const { OccupiedUnlockIntentService } = await import(
        '@/services/occupied-unlock-intent.service'
      );
      const recent = OccupiedUnlockIntentService.getInstance().tryConsumeForUnlockState(event.deviceId);
      if (recent) {
        occupiedStateAttr = {
          userId: recent.userId,
          userName: recent.userName,
          role: recent.role,
          override: recent.override,
        };
      }
    }

    const appliedAttribution = appliedRemoteAttribution;
    const isCorrelatedRemoteUnlock =
      Boolean(appliedAttribution) && activityType === 'unlock';
    const actorType = appliedAttribution || occupiedStateAttr ? 'user' : 'gateway';
    const actorId = appliedAttribution?.initiator.userId ?? occupiedStateAttr?.userId;
    const actorName =
      appliedAttribution?.initiator.userName
      ?? occupiedStateAttr?.userName
      ?? 'Gateway';
    const override =
      appliedAttribution?.tenantUnlockOverride ?? occupiedStateAttr?.override;
    const description = isCorrelatedRemoteUnlock && appliedAttribution
      ? [
          `Device was unlocked at the site following remote access by ${appliedAttribution.initiator.userName}`,
          override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
          override?.notes ? `Notes: ${override.notes}` : null,
        ].filter(Boolean).join('. ')
      : appliedAttribution
        ? [
            `Device was ${lockActivityVerb(activityType)} remotely via gateway by ${appliedAttribution.initiator.userName}`,
            override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
            override?.notes ? `Notes: ${override.notes}` : null,
          ].filter(Boolean).join('. ')
        : occupiedStateAttr
          ? [
              `Device was ${lockActivityVerb(activityType)} via app by ${occupiedStateAttr.userName}`,
              override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
              override?.notes ? `Notes: ${override.notes}` : null,
            ].filter(Boolean).join('. ')
          : `Device was ${lockActivityVerb(activityType)} locally at the device`;

    const title = isCorrelatedRemoteUnlock
      ? 'Unlocked at Site'
      : lockActivityTitle(activityType);

    await ActivityService.getInstance().logActivity({
      entityType: 'device',
      entityId: event.deviceId,
      activityType,
      title,
      description,
      actorType,
      actorId,
      actorName,
      result: 'success',
      facilityId: gateway.facility_id,
      unitId,
      deviceId: event.deviceId,
      metadata: {
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        gatewayId: event.gatewayId,
        device_type: deviceType,
        ...(isCorrelatedRemoteUnlock && appliedAttribution
          ? {
            // Physical site unlock; outbound "Remote Access Granted" already recorded the remote method.
            method: 'local_device',
            correlated_remote: true,
            remote_command_id: appliedAttribution.commandId,
            gateway_id: event.gatewayId,
            initiated_by: {
              id: appliedAttribution.initiator.userId,
              name: appliedAttribution.initiator.userName,
              role: appliedAttribution.initiator.role,
            },
            ...(override
              ? {
                occupied_unit_override: true,
                tenant_unlock_override: {
                  reason: override.reason,
                  reason_label: override.reasonLabel,
                  notes: override.notes ?? null,
                },
              }
              : {}),
          }
          : remoteMethod && appliedAttribution
            ? {
              method: remoteMethod,
              initiated_remotely: true,
              gateway_id: event.gatewayId,
              initiated_by: {
                id: appliedAttribution.initiator.userId,
                name: appliedAttribution.initiator.userName,
                role: appliedAttribution.initiator.role,
              },
              ...(override
                ? {
                  tenant_unlock_override: {
                    reason: override.reason,
                    reason_label: override.reasonLabel,
                    notes: override.notes ?? null,
                  },
                }
                : {}),
            }
            : occupiedStateAttr
              ? {
                method: 'app',
                initiated_remotely: false,
                occupied_unit_override: true,
                gateway_id: event.gatewayId,
                initiated_by: {
                  id: occupiedStateAttr.userId,
                  name: occupiedStateAttr.userName,
                  role: occupiedStateAttr.role,
                },
                tenant_unlock_override: {
                  reason: occupiedStateAttr.override.reason,
                  reason_label: occupiedStateAttr.override.reasonLabel,
                  notes: occupiedStateAttr.override.notes ?? null,
                },
              }
              : {
                method: 'local_device',
              }),
      },
    });
  }

  /**
   * Log an activity when a device's connectivity status changes.
   * Uses dynamic import to avoid circular dependency issues at startup.
   */
  private async logDeviceStatusActivity(event: DeviceStatusChangedEvent): Promise<void> {
    const { ActivityService } = await import('@/services/activity.service');
    const { DeviceModel } = await import('@/models/device.model');

    const deviceModel = new DeviceModel();
    const gateway = await deviceModel.findGatewayById(event.gatewayId);
    if (!gateway) {
      logger.warn(`Cannot log device status activity: gateway ${event.gatewayId} not found`);
      return;
    }

    await ActivityService.getInstance().logStatusChange(
      event.deviceId,
      gateway.facility_id,
      event.oldStatus,
      event.newStatus,
      { gatewayId: event.gatewayId, deviceType: event.deviceType }
    );
  }
}
