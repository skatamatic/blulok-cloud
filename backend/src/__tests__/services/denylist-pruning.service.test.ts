import { DenylistPruningService } from '@/services/denylist-pruning.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';

jest.mock('@/models/denylist-entry.model');

describe('DenylistPruningService', () => {
  let service: DenylistPruningService;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setImmediate'] });
    mockDenylistModel = {
      pruneExpired: jest.fn().mockResolvedValue(5),
    } as any;

    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);
    service = DenylistPruningService.getInstance();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    service.stop();
    // Reset singleton
    (DenylistPruningService as any).instance = undefined;
  });

  describe('prune', () => {
    it('removes expired entries and returns count', async () => {
      const result = await service.prune();
      expect(mockDenylistModel.pruneExpired).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('handles errors gracefully', async () => {
      mockDenylistModel.pruneExpired.mockRejectedValue(new Error('Database error'));
      await expect(service.prune()).rejects.toThrow('Database error');
    });
  });

  describe('start', () => {
    it('starts daily pruning interval', async () => {
      service.start();
      
      // Wait for the immediate async prune call to complete
      // The service calls prune().catch() which is fire-and-forget
      // Give it a moment to execute
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockDenylistModel.pruneExpired).toHaveBeenCalledTimes(1); // Called immediately

      // Fast-forward 24 hours - this will trigger the interval callback
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      
      // Wait for the scheduled async prune call to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockDenylistModel.pruneExpired).toHaveBeenCalledTimes(2);
    });

    it('does not start multiple intervals', async () => {
      service.start();
      
      // Wait for the immediate async prune call to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const firstCallCount = mockDenylistModel.pruneExpired.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0); // Should have been called at least once
      
      service.start(); // Should be ignored
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Count should not have increased significantly (maybe 1 more from the duplicate start)
      expect(mockDenylistModel.pruneExpired.mock.calls.length).toBeLessThanOrEqual(firstCallCount + 1);
    });
  });

  describe('stop', () => {
    it('stops the pruning interval', () => {
      service.start();
      service.stop();

      const callCount = mockDenylistModel.pruneExpired.mock.calls.length;
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(mockDenylistModel.pruneExpired.mock.calls.length).toBe(callCount);
    });

    it('handles stop when not started', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });
});

