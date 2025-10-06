import { ModelHooksService } from '../../services/model-hooks.service';
import { WebSocketService } from '../../services/websocket.service';

// Mock the WebSocket service
jest.mock('../../services/websocket.service');

describe('ModelHooksService', () => {
  let service: ModelHooksService;
  let mockWsService: any;

  beforeEach(() => {
    mockWsService = {
      broadcastGeneralStatsUpdate: jest.fn().mockResolvedValue(undefined)
    };
    (WebSocketService.getInstance as jest.Mock).mockReturnValue(mockWsService);
    // Reset the service instance to ensure it uses the mocked WebSocket service
    (ModelHooksService as any).instance = undefined;
    service = ModelHooksService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerModelChange', () => {
    it('should broadcast general stats update on model change', async () => {
      const event = {
        model: 'facility',
        changeType: 'create' as const,
        recordId: 'facility-123',
        data: { name: 'Test Facility' },
        timestamp: new Date()
      };

      await service.triggerModelChange(event);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });

    it('should handle broadcast errors gracefully', async () => {
      mockWsService.broadcastGeneralStatsUpdate.mockRejectedValueOnce(new Error('WebSocket error'));

      const event = {
        model: 'user',
        changeType: 'update' as const,
        recordId: 'user-123',
        data: { name: 'Updated User' },
        timestamp: new Date()
      };

      // Should not throw
      await expect(service.triggerModelChange(event)).resolves.toBeUndefined();
    });
  });

  describe('onFacilityChange', () => {
    it('should trigger model change for facility create', async () => {
      const facilityId = 'facility-123';
      const data = { name: 'New Facility' };

      await service.onFacilityChange('create', facilityId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });

    it('should trigger model change for facility update', async () => {
      const facilityId = 'facility-123';
      const data = { name: 'Updated Facility' };

      await service.onFacilityChange('update', facilityId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });

    it('should trigger model change for facility delete', async () => {
      const facilityId = 'facility-123';

      await service.onFacilityChange('delete', facilityId);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('onUserChange', () => {
    it('should trigger model change for user status change', async () => {
      const userId = 'user-123';
      const data = { is_active: false };

      await service.onUserChange('status_change', userId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDeviceChange', () => {
    it('should trigger model change for device status change', async () => {
      const deviceId = 'device-123';
      const data = { status: 'offline' };

      await service.onDeviceChange('status_change', deviceId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('onUserFacilityAssociationChange', () => {
    it('should trigger model change for association create', async () => {
      const associationId = 'assoc-123';
      const data = { user_id: 'user-123', facility_id: 'facility-123' };

      await service.onUserFacilityAssociationChange('create', associationId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });

    it('should trigger model change for association delete', async () => {
      const associationId = 'assoc-123';

      await service.onUserFacilityAssociationChange('delete', associationId);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });

    it('should trigger model change for association update', async () => {
      const associationId = 'user-123';
      const data = { facilityIds: ['facility-1', 'facility-2'] };

      await service.onUserFacilityAssociationChange('update', associationId, data);

      expect(mockWsService.broadcastGeneralStatsUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
