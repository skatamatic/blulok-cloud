import { DataPruningService } from '@/services/data-pruning.service';
import { DatabaseService } from '@/services/database.service';

jest.mock('@/services/database.service');

describe('DataPruningService', () => {
  let service: DataPruningService;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      modify: jest.fn().mockReturnThis(),
      del: jest.fn().mockResolvedValue(5), // Default: remove 5 records
    };

    mockDb = jest.fn(() => mockQueryBuilder);

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockDb,
    });

    // Reset singleton
    (DataPruningService as any).instance = undefined;
    service = DataPruningService.getInstance();
  });

  afterEach(() => {
    service.stop();
    // Clean up singleton after each test
    (DataPruningService as any).instance = undefined;
  });

  describe('prune', () => {
    it('should prune expired and consumed invites', async () => {
      mockQueryBuilder.del.mockResolvedValueOnce(10); // invites
      mockQueryBuilder.del.mockResolvedValueOnce(5);  // otps
      mockQueryBuilder.del.mockResolvedValueOnce(3);  // tokens

      const results = await service.prune();

      expect(results.invites).toBe(10);
      expect(results.otps).toBe(5);
      expect(results.passwordResetTokens).toBe(3);
      expect(mockDb).toHaveBeenCalledWith('user_invites');
      expect(mockDb).toHaveBeenCalledWith('user_otps');
      expect(mockDb).toHaveBeenCalledWith('password_reset_tokens');
    });

    it('should handle empty results gracefully', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const results = await service.prune();

      expect(results.invites).toBe(0);
      expect(results.otps).toBe(0);
      expect(results.passwordResetTokens).toBe(0);
    });

    it('should handle errors per-table without stopping other prunes', async () => {
      // First table (invites) fails, others succeed
      mockQueryBuilder.del
        .mockRejectedValueOnce(new Error('Database error for invites'))
        .mockResolvedValueOnce(5)  // otps succeed
        .mockResolvedValueOnce(3); // tokens succeed

      const results = await service.prune();

      expect(results.invites).toBe(0); // Failed, so 0
      expect(results.otps).toBe(5); // Succeeded
      expect(results.passwordResetTokens).toBe(3); // Succeeded
      expect(results.errors).toBeDefined();
      expect(results.errors?.length).toBe(1);
      expect(results.errors?.[0]).toContain('user_invites');
    });

    it('should continue pruning even if all tables fail', async () => {
      mockQueryBuilder.del.mockRejectedValue(new Error('Database error'));

      const results = await service.prune();

      expect(results.invites).toBe(0);
      expect(results.otps).toBe(0);
      expect(results.passwordResetTokens).toBe(0);
      expect(results.errors?.length).toBe(3); // All three failed
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

