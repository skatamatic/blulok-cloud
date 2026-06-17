jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-recovery-uuid') }));

import { GatewayRecoveryModel } from '@/models/gateway-recovery.model';

describe('GatewayRecoveryModel', () => {
  let model: GatewayRecoveryModel;
  let mockTrxBuilder: Record<string, jest.Mock>;
  let mockOuterBuilder: Record<string, jest.Mock>;
  let mockKnex: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new GatewayRecoveryModel();

    mockTrxBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(1),
      forUpdate: jest.fn().mockReturnThis(),
    };

    mockOuterBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
    };

    mockKnex = jest.fn((table: string) => {
      if (table === 'gateways' || table === 'gateway_recoveries') {
        return mockTrxBuilder;
      }
      return mockOuterBuilder;
    }) as jest.Mock;

    mockKnex.transaction = jest.fn(async (cb: (trx: typeof mockKnex) => Promise<unknown>) => cb(mockKnex));

    (model as unknown as { db: { connection: jest.Mock } }).db = { connection: mockKnex };
  });

  describe('createIfNoActive', () => {
    it('returns existing recovery when facility already has an active row', async () => {
      const existing = {
        id: 'rec-existing',
        facility_id: 'fac-1',
        gateway_id: 'gw-1',
        status: 'detected',
      };
      mockTrxBuilder.first.mockResolvedValueOnce(existing);

      const result = await model.createIfNoActive({
        facility_id: 'fac-1',
        gateway_id: 'gw-2',
        previous_gateway_id: 'gw-old',
      });

      expect(result.recovery).toBeNull();
      expect(result.existingRecovery).toEqual(existing);
      expect(mockTrxBuilder.insert).not.toHaveBeenCalled();
    });

    it('inserts a new recovery when none is active', async () => {
      mockTrxBuilder.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'generated-recovery-uuid',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          status: 'detected',
        });

      const result = await model.createIfNoActive({
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        status: 'detected',
      });

      expect(result.existingRecovery).toBeNull();
      expect(result.recovery?.id).toBe('generated-recovery-uuid');
      expect(mockTrxBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'generated-recovery-uuid',
          facility_id: 'fac-1',
          gateway_id: 'gw-new',
          previous_gateway_id: 'gw-old',
          status: 'detected',
        }),
      );
    });
  });

  describe('updateActiveGatewayId', () => {
    it('returns null when no non-terminal row matches', async () => {
      mockTrxBuilder.update.mockResolvedValueOnce(0);

      const updated = await model.updateActiveGatewayId('fac-1', 'rec-1', 'gw-new');

      expect(updated).toBeNull();
    });

    it('returns updated recovery when gateway_id changes', async () => {
      mockTrxBuilder.update.mockResolvedValueOnce(1);
      mockTrxBuilder.first.mockResolvedValueOnce({
        id: 'rec-1',
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        status: 'detected',
      });

      const updated = await model.updateActiveGatewayId('fac-1', 'rec-1', 'gw-new');

      expect(updated?.gateway_id).toBe('gw-new');
      expect(mockTrxBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ gateway_id: 'gw-new' }),
      );
    });
  });

  describe('atomicCancel', () => {
    it('returns false when recovery is already terminal', async () => {
      mockTrxBuilder.update.mockResolvedValueOnce(0);

      const cancelled = await model.atomicCancel('rec-1');

      expect(cancelled).toBe(false);
    });

    it('returns true when an active recovery is cancelled', async () => {
      mockTrxBuilder.update.mockResolvedValueOnce(1);

      const cancelled = await model.atomicCancel('rec-1');

      expect(cancelled).toBe(true);
      expect(mockTrxBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });
  });
});
