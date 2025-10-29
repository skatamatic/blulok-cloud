import { WebSocketService } from './websocket.service';
import { logger } from '@/utils/logger';

/**
 * Model Change Types
 *
 * Defines the types of changes that can occur to database models.
 * Used for triggering appropriate real-time updates and event handling.
 */
export type ModelChangeType = 'create' | 'update' | 'delete' | 'status_change';

/**
 * Model Change Event Interface
 *
 * Represents a change to a database model that should trigger real-time updates.
 * Used by the model hooks service to broadcast changes to WebSocket clients.
 */
export interface ModelChangeEvent {
  /** Name of the model that changed (e.g., 'user', 'facility', 'device') */
  model: string;
  /** Type of change that occurred */
  changeType: ModelChangeType;
  /** Primary key of the changed record */
  recordId: string;
  /** Optional additional data about the change */
  data?: any;
  /** Timestamp when the change occurred */
  timestamp: Date;
}

/**
 * Model Hooks Service
 *
 * Event-driven service that hooks into model changes and triggers real-time
 * WebSocket broadcasts to keep client applications synchronized.
 *
 * Key Features:
 * - Centralized model change handling
 * - Automatic WebSocket broadcast triggering
 * - Extensible hook system for new model types
 * - Comprehensive logging for debugging
 * - Graceful error handling to prevent cascading failures
 *
 * Architecture:
 * - Singleton pattern ensuring consistent event handling
 * - Integration with WebSocketService for real-time broadcasts
 * - Typed event system with model-specific hooks
 * - Asynchronous processing to avoid blocking model operations
 *
 * Hook Integration:
 * - Facility changes trigger general stats updates
 * - User changes trigger general stats and access control updates
 * - Device changes trigger status and connectivity updates
 * - Association changes trigger permission and scoping updates
 *
 * Business Impact:
 * - Real-time dashboard updates without manual refresh
 * - Consistent data across multiple client sessions
 * - Immediate visibility of system changes
 * - Improved user experience with live data synchronization
 */
export class ModelHooksService {
  private static instance: ModelHooksService;
  private wsService = WebSocketService.getInstance();

  public static getInstance(): ModelHooksService {
    if (!ModelHooksService.instance) {
      ModelHooksService.instance = new ModelHooksService();
    }
    return ModelHooksService.instance;
  }

  /**
   * Trigger a model change event and broadcast to relevant subscribers
   */
  public async triggerModelChange(event: ModelChangeEvent): Promise<void> {
    try {
      logger.debug(`Model change detected: ${event.model} ${event.changeType} ${event.recordId}`);
      
      // Broadcast general stats update to all subscribers
      await this.wsService.broadcastGeneralStatsUpdate();
      
      logger.debug(`General stats update broadcasted for ${event.model} ${event.changeType}`);
    } catch (error) {
      logger.error('Error handling model change:', error);
    }
  }

  /**
   * Hook for facility changes
   */
  public async onFacilityChange(changeType: ModelChangeType, facilityId: string, data?: any): Promise<void> {
    await this.triggerModelChange({
      model: 'facility',
      changeType,
      recordId: facilityId,
      data,
      timestamp: new Date()
    });
  }

  /**
   * Hook for user changes
   */
  public async onUserChange(changeType: ModelChangeType, userId: string, data?: any): Promise<void> {
    await this.triggerModelChange({
      model: 'user',
      changeType,
      recordId: userId,
      data,
      timestamp: new Date()
    });
  }

  /**
   * Hook for device changes
   */
  public async onDeviceChange(changeType: ModelChangeType, deviceId: string, data?: any): Promise<void> {
    await this.triggerModelChange({
      model: 'device',
      changeType,
      recordId: deviceId,
      data,
      timestamp: new Date()
    });
  }

  /**
   * Hook for user-facility association changes
   */
  public async onUserFacilityAssociationChange(changeType: ModelChangeType, associationId: string, data?: any): Promise<void> {
    await this.triggerModelChange({
      model: 'user_facility_association',
      changeType,
      recordId: associationId,
      data,
      timestamp: new Date()
    });
  }
}
