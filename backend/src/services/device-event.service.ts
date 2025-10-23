import { EventEmitter } from 'events';
import { WebSocketService } from './websocket.service';

/**
 * Events emitted by the device system
 */
export enum DeviceEvent {
  DEVICE_STATUS_CHANGED = 'deviceStatusChanged',
  LOCK_STATUS_CHANGED = 'lockStatusChanged',
  DEVICE_ADDED = 'deviceAdded',
  DEVICE_REMOVED = 'deviceRemoved'
}

/**
 * Device event data interfaces
 */
export interface DeviceStatusChangedEvent {
  deviceId: string;
  deviceType: 'blulok' | 'access_control';
  oldStatus: string;
  newStatus: string;
  gatewayId: string;
}

export interface LockStatusChangedEvent {
  deviceId: string;
  oldStatus: 'locked' | 'unlocked' | 'error';
  newStatus: 'locked' | 'unlocked' | 'error';
  gatewayId: string;
  unitId: string;
}

export interface DeviceAddedEvent {
  deviceId: string;
  deviceType: 'blulok' | 'access_control';
  gatewayId: string;
  unitId?: string;
}

export interface DeviceRemovedEvent {
  deviceId: string;
  deviceType: 'blulok' | 'access_control';
  gatewayId: string;
}

/**
 * Service that manages device-related events and broadcasting.
 * This decouples device model operations from WebSocket broadcasting.
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
}
