import { EventEmitter } from 'events';
import { WebSocketService } from './websocket.service';

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
  oldStatus: 'locked' | 'unlocked' | 'error' | 'maintenance' | 'unknown';
  /** New lock state */
  newStatus: 'locked' | 'unlocked' | 'error' | 'maintenance' | 'unknown';
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
    reason?: 'manual' | 'reassigned' | 'unit_deleted';
  };
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
    // Broadcast units update when lock status changes
    this.on(DeviceEvent.LOCK_STATUS_CHANGED, async (_event: LockStatusChangedEvent) => {
      try {
        if (this.wsService) {
          await this.wsService.broadcastUnitsUpdate();
        } else {
          console.warn('WebSocketService not initialized, skipping units update broadcast');
        }
      } catch (error) {
        console.error('Failed to broadcast units update:', error);
      }
    });

    // Broadcast battery status updates when device status changes
    this.on(DeviceEvent.DEVICE_STATUS_CHANGED, async (_event: DeviceStatusChangedEvent) => {
      try {
        if (this.wsService) {
          // Battery status updates affect battery monitoring
          await this.wsService.broadcastBatteryStatusUpdate();
        } else {
          console.warn('WebSocketService not initialized, skipping battery status update broadcast');
        }
      } catch (error) {
        console.error('Failed to broadcast battery status update:', error);
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
}
