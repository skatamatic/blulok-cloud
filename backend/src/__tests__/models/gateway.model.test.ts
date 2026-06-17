jest.unmock('@/models/gateway.model');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-gateway-uuid') }));

import { GatewayModel } from '@/models/gateway.model';

describe('GatewayModel', () => {
  let model: GatewayModel;
  let mockBuilder: Record<string, jest.Mock>;
  let mockKnex: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new GatewayModel();

    mockBuilder = {
      insert: jest.fn().mockResolvedValue(undefined),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        id: 'generated-gateway-uuid',
        facility_id: 'fac-1',
        name: 'Test Gateway',
        status: 'online',
      }),
    };
    mockKnex = jest.fn(() => mockBuilder);
    (model as any).db = { connection: mockKnex };
  });

  describe('create', () => {
    it('inserts with a generated UUID and returns the created row', async () => {
      const created = await model.create({
        facility_id: 'fac-1',
        name: 'Test Gateway',
        status: 'online',
      });

      expect(mockKnex).toHaveBeenCalledWith('gateways');
      expect(mockBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'generated-gateway-uuid',
          facility_id: 'fac-1',
          name: 'Test Gateway',
          status: 'online',
        }),
      );
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'generated-gateway-uuid');
      expect(created.id).toBe('generated-gateway-uuid');
    });
  });

  describe('createWithId', () => {
    it('inserts honoring the supplied primary key and stringifies metadata', async () => {
      await model.createWithId('supplied-guid', {
        facility_id: null,
        name: 'Swap candidate',
        status: 'online',
        metadata: { autoRegistered: true },
      });

      expect(mockBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'supplied-guid',
          facility_id: null,
          name: 'Swap candidate',
          metadata: JSON.stringify({ autoRegistered: true }),
        }),
      );
    });
  });

  describe('createUnboundSwapCandidateIfAbsent', () => {
    it('returns existing row without inserting', async () => {
      mockBuilder.first.mockResolvedValueOnce({ id: 'existing', facility_id: null });

      const result = await model.createUnboundSwapCandidateIfAbsent({
        id: 'existing',
        name: 'Swap candidate',
      });

      expect(result.created).toBe(false);
      expect(result.gateway?.id).toBe('existing');
      expect(mockBuilder.insert).not.toHaveBeenCalled();
    });

    it('inserts when absent and handles duplicate key races idempotently', async () => {
      mockBuilder.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'race-guid', facility_id: null });
      mockBuilder.insert.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 });

      const result = await model.createUnboundSwapCandidateIfAbsent({
        id: 'race-guid',
        name: 'Swap candidate',
      });

      expect(result.created).toBe(false);
      expect(result.gateway?.id).toBe('race-guid');
    });
  });

  describe('createOrBindAsFirstGateway', () => {
    function buildTrx(firstReturns: Array<unknown>) {
      const first = jest.fn();
      firstReturns.forEach((r) => first.mockResolvedValueOnce(r));
      const trxBuilder = {
        where: jest.fn().mockReturnThis(),
        first,
        insert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(1),
      };
      const trx = jest.fn(() => trxBuilder);
      mockKnex.transaction = jest.fn(async (cb: any) => cb(trx));
      return trxBuilder;
    }

    it('creates and binds when the facility has no bound gateway', async () => {
      const trxBuilder = buildTrx([
        null, // existingBound
        null, // existingRow
        { id: 'guid-1', facility_id: 'fac-1' }, // final
      ]);

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-1',
        facilityId: 'fac-1',
        name: 'Gateway guid-1',
        metadata: { autoRegistered: true },
      });

      expect(result.bound).toBe(true);
      expect(result.created).toBe(true);
      expect(trxBuilder.insert).toHaveBeenCalled();
    });

    it('binds an existing unbound row without inserting', async () => {
      const trxBuilder = buildTrx([
        null, // existingBound
        { id: 'guid-2', facility_id: null }, // existingRow
        { id: 'guid-2', facility_id: 'fac-1' }, // final
      ]);

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-2',
        facilityId: 'fac-1',
        name: 'Gateway guid-2',
      });

      expect(result.bound).toBe(true);
      expect(result.created).toBe(false);
      expect(trxBuilder.insert).not.toHaveBeenCalled();
      expect(trxBuilder.update).toHaveBeenCalled();
    });

    it('returns bound:false when a bound gateway already exists (race lost)', async () => {
      const trxBuilder = buildTrx([
        { id: 'existing-bound', facility_id: 'fac-1' }, // existingBound
      ]);

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-3',
        facilityId: 'fac-1',
        name: 'Gateway guid-3',
      });

      expect(result.bound).toBe(false);
      expect(result.created).toBe(false);
      expect(trxBuilder.insert).not.toHaveBeenCalled();
      expect(trxBuilder.update).not.toHaveBeenCalled();
    });
  });
});
