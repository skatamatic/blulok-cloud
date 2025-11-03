import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { RoutePassIssuanceModel } from '@/models/route-pass-issuance.model';
import { DeviceDenylistEntry } from '@/models/denylist-entry.model';

jest.mock('@/models/route-pass-issuance.model');

describe('DenylistOptimizationService', () => {
  let mockRoutePassModel: jest.Mocked<RoutePassIssuanceModel>;

  beforeEach(() => {
    mockRoutePassModel = {
      isUserPassExpired: jest.fn(),
    } as any;

    (RoutePassIssuanceModel as jest.MockedClass<typeof RoutePassIssuanceModel>).mockImplementation(() => {
      return mockRoutePassModel;
    });

    // Reset the static service's internal model
    (DenylistOptimizationService as any).routePassModel = mockRoutePassModel;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldSkipDenylistAdd', () => {
    it('returns true if user has no route passes', async () => {
      mockRoutePassModel.isUserPassExpired.mockResolvedValue(true);

      const result = await DenylistOptimizationService.shouldSkipDenylistAdd('user-1');

      expect(result).toBe(true);
      expect(mockRoutePassModel.isUserPassExpired).toHaveBeenCalledWith('user-1');
    });

    it('returns true if user last route pass is expired', async () => {
      mockRoutePassModel.isUserPassExpired.mockResolvedValue(true);

      const result = await DenylistOptimizationService.shouldSkipDenylistAdd('user-1');

      expect(result).toBe(true);
    });

    it('returns false if user has active route pass', async () => {
      mockRoutePassModel.isUserPassExpired.mockResolvedValue(false);

      const result = await DenylistOptimizationService.shouldSkipDenylistAdd('user-1');

      expect(result).toBe(false);
    });

    it('returns false on error (fail-safe)', async () => {
      mockRoutePassModel.isUserPassExpired.mockRejectedValue(new Error('DB error'));

      const logger = require('@/utils/logger');
      const loggerErrorSpy = jest.spyOn(logger.logger, 'error').mockImplementation();

      const result = await DenylistOptimizationService.shouldSkipDenylistAdd('user-1');

      expect(result).toBe(false);
      expect(loggerErrorSpy).toHaveBeenCalled();
      loggerErrorSpy.mockRestore();
    });
  });

  describe('shouldSkipDenylistRemove', () => {
    it('returns false for permanent entries (expires_at = null)', () => {
      const entry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'user_deactivation',
      };

      const result = DenylistOptimizationService.shouldSkipDenylistRemove(entry);

      expect(result).toBe(false);
    });

    it('returns false if entry has not expired', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const entry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: futureDate,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'unit_unassignment',
      };

      const result = DenylistOptimizationService.shouldSkipDenylistRemove(entry);

      expect(result).toBe(false);
    });

    it('returns true if entry has expired', () => {
      // Create a date that's definitely in the past
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 2); // 2 hours ago
      
      const entry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: pastDate,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'key_sharing_revocation',
      };

      const result = DenylistOptimizationService.shouldSkipDenylistRemove(entry);

      expect(result).toBe(true);
    });

    it('returns true if entry expires exactly now (or in past)', () => {
      // Create a date slightly in the past to ensure comparison works
      const expiredDate = new Date(Date.now() - 10); // 10ms ago
      const entry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: expiredDate,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'fms_sync',
      };

      const result = DenylistOptimizationService.shouldSkipDenylistRemove(entry);

      expect(result).toBe(true);
    });
  });
});

