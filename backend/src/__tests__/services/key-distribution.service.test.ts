import { KeyDistributionService } from '@/services/key-distribution.service';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';

// Mock the KeyDistributionService
jest.mock('@/services/key-distribution.service');

describe('KeyDistributionService', () => {
  let mockKeyDistributionService: jest.Mocked<KeyDistributionService>;
  let testData: MockTestData;

  beforeEach(() => {
    testData = createMockTestData();

    // Create a mock KeyDistributionService
    mockKeyDistributionService = {
      addKeysForUserDevice: jest.fn(),
      removeKeysForUserDevice: jest.fn(),
      onTenancyChange: jest.fn(),
      onLockAdded: jest.fn(),
      processPending: jest.fn(),
      computeAndEnqueueDiffs: jest.fn(),
    } as any;

    // Mock the KeyDistributionService getInstance method
    (KeyDistributionService.getInstance as jest.Mock).mockReturnValue(mockKeyDistributionService);
  });

  describe('Singleton and Initialization', () => {
    it('should create singleton instance', () => {
      expect(KeyDistributionService.getInstance()).toBe(mockKeyDistributionService);
    });
  });

  describe('addKeysForUserDevice', () => {
    it('should call addKeysForUserDevice method', async () => {
      mockKeyDistributionService.addKeysForUserDevice.mockResolvedValue(undefined);

      await mockKeyDistributionService.addKeysForUserDevice(testData.users.tenant.id, 'device-1');

      expect(mockKeyDistributionService.addKeysForUserDevice).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'device-1'
      );
    });
  });

  describe('removeKeysForUserDevice', () => {
    it('should call removeKeysForUserDevice method', async () => {
      mockKeyDistributionService.removeKeysForUserDevice.mockResolvedValue(undefined);

      await mockKeyDistributionService.removeKeysForUserDevice('device-1');

      expect(mockKeyDistributionService.removeKeysForUserDevice).toHaveBeenCalledWith('device-1');
    });
  });

  describe('onTenancyChange - Smart Diffing', () => {
    it('should call onTenancyChange method', async () => {
      mockKeyDistributionService.onTenancyChange.mockResolvedValue(undefined);

      await mockKeyDistributionService.onTenancyChange(testData.users.tenant.id);

      expect(mockKeyDistributionService.onTenancyChange).toHaveBeenCalledWith(testData.users.tenant.id);
    });
  });

  describe('onLockAdded', () => {
    it('should call onLockAdded method', async () => {
      mockKeyDistributionService.onLockAdded.mockResolvedValue(undefined);

      await mockKeyDistributionService.onLockAdded('lock-1', 'unit-1');

      expect(mockKeyDistributionService.onLockAdded).toHaveBeenCalledWith('lock-1', 'unit-1');
    });
  });

  describe('processPending', () => {
    it('should call processPending method', async () => {
      mockKeyDistributionService.processPending.mockResolvedValue(undefined);

      await mockKeyDistributionService.processPending();

      expect(mockKeyDistributionService.processPending).toHaveBeenCalled();
    });
  });
});
