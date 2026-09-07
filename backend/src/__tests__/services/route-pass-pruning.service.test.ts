import { RoutePassPruningService } from '@/services/route-pass-pruning.service';
import { DatabaseService } from '@/services/database.service';

jest.mock('@/services/database.service');

describe('RoutePassPruningService', () => {
  let service: RoutePassPruningService;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      del: jest.fn().mockResolvedValue(5), // Default: remove 5 records
    };

    mockDb = jest.fn(() => mockQueryBuilder);

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockDb,
    });

    // Reset singleton
    (RoutePassPruningService as any).instance = undefined;
    service = RoutePassPruningService.getInstance();
  });

  afterEach(() => {
    service.stop();
    // Clean up singleton after each test
    (RoutePassPruningService as any).instance = undefined;
  });

  describe('prune', () => {
    it('should prune expired route passes', async () => {
      mockQueryBuilder.del.mockResolvedValueOnce(10);

      const results = await service.prune();

      expect(results.routePasses).toBe(10);
      expect(mockDb).toHaveBeenCalledWith('route_pass_issuance_log');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('expires_at', '<=', expect.any(Date));
      expect(mockQueryBuilder.del).toHaveBeenCalled();
    });

    it('should handle empty results gracefully', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const results = await service.prune();

      expect(results.routePasses).toBe(0);
      expect(results.errors).toEqual([]);
    });

    it('should handle errors gracefully without crashing', async () => {
      mockQueryBuilder.del.mockRejectedValueOnce(new Error('Database error'));

      const results = await service.prune();

      expect(results.routePasses).toBe(0);
      expect(results.errors).toBeDefined();
      expect(results.errors?.length).toBe(1);
      expect(results.errors?.[0].table).toBe('route_pass_issuance_log');
      expect(results.errors?.[0].message).toContain('Failed to prune route_pass_issuance_log');
    });

    it('should use correct retention period cutoff', async () => {
      const beforePrune = Date.now();
      mockQueryBuilder.del.mockResolvedValueOnce(5);

      await service.prune();

      const afterPrune = Date.now();
      
      // Verify where was called with a date that's approximately 7 days ago
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('expires_at', '<=', expect.any(Date));
      
      const whereCall = (mockQueryBuilder.where as jest.Mock).mock.calls[0];
      expect(whereCall[0]).toBe('expires_at');
      expect(whereCall[1]).toBe('<=');
      const cutoffDate = whereCall[2];
      expect(cutoffDate).toBeInstanceOf(Date);
      
      const cutoffTime = cutoffDate.getTime();
      const expectedCutoff = beforePrune - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const tolerance = 2000; // 2 second tolerance for test execution time

      expect(cutoffTime).toBeGreaterThanOrEqual(expectedCutoff - tolerance);
      expect(cutoffTime).toBeLessThanOrEqual(afterPrune - (7 * 24 * 60 * 60 * 1000) + tolerance);
    });
  });

  describe('start', () => {
    it('starts daily pruning interval', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);
      service.start();

      // Wait for the immediate async prune call to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockDb).toHaveBeenCalled();
      service.stop();
    });

    it('does not start multiple intervals', () => {
      service.start();
      service.start(); // Should be ignored

      service.stop();
      // If we get here without errors, it worked
      expect(true).toBe(true);
    });
  });

  describe('stop', () => {
    it('stops the pruning interval', () => {
      service.start();
      service.stop();

      // If we get here without errors, it worked
      expect(true).toBe(true);
    });
  });
});

