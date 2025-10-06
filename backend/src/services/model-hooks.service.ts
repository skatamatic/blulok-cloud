import { WebSocketService } from './websocket.service';
import { logger } from '@/utils/logger';

export type ModelChangeType = 'create' | 'update' | 'delete' | 'status_change';

export interface ModelChangeEvent {
  model: string;
  changeType: ModelChangeType;
  recordId: string;
  data?: any;
  timestamp: Date;
}

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
