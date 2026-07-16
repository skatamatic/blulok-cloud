jest.unmock('@/models/gateway.model');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-gateway-uuid') }));

import { GatewayModel } from '@/models/gateway.model';

describe('GatewayModel', () => {
  let model: GatewayModel;
  let mockBuilder: Record<string, jest.Mock>;
  let mockKnex: jest.Mock & { transaction: jest.Mock };

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
    mockKnex = jest.fn(() => mockBuilder) as jest.Mock & { transaction: jest.Mock };
    mockKnex.transaction = jest.fn(async (cb: (trx: jest.Mock) => Promise<unknown>) => cb(mockKnex));
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
    function buildTrx(options: {
      existingBound: unknown;
      existingRow: unknown;
      facilityName?: string;
      finalRow?: unknown;
    }) {
      const firstByTable: Record<string, jest.Mock> = {
        gateways: jest
          .fn()
          .mockResolvedValueOnce(options.existingBound)
          .mockResolvedValueOnce(options.existingRow)
          .mockResolvedValueOnce(
            options.finalRow ?? {
              id: 'guid-1',
              facility_id: 'fac-1',
              name: options.facilityName ?? 'North Depot',
            },
          ),
        facilities: jest.fn().mockResolvedValue({
          id: 'fac-1',
          name: options.facilityName ?? 'North Depot',
        }),
      };
      const builders: Record<string, { where: jest.Mock; first: jest.Mock; insert: jest.Mock; update: jest.Mock }> =
        {};
      const trx = jest.fn((table: string) => {
        if (!builders[table]) {
          builders[table] = {
            where: jest.fn().mockReturnThis(),
            first: firstByTable[table] || jest.fn().mockResolvedValue(null),
            insert: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        return builders[table];
      });
      mockKnex.transaction = jest.fn(async (cb: any) => cb(trx));
      return { trx, builders };
    }

    it('creates and binds using the facility name', async () => {
      const { builders } = buildTrx({
        existingBound: null,
        existingRow: null,
        facilityName: 'North Depot',
      });

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-1',
        facilityId: 'fac-1',
        metadata: { autoRegistered: true },
      });

      expect(result.bound).toBe(true);
      expect(result.created).toBe(true);
      expect(builders.gateways.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'North Depot',
          facility_id: 'fac-1',
        }),
      );
    });

    it('rebinds an unbound row and replaces a prior facility display name', async () => {
      const { builders } = buildTrx({
        existingBound: null,
        existingRow: {
          id: 'guid-2',
          facility_id: null,
          name: 'Other Facility Gateway',
          metadata: JSON.stringify({ autoRegistered: true }),
        },
        facilityName: 'North Depot',
      });

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-2',
        facilityId: 'fac-1',
      });

      expect(result.bound).toBe(true);
      expect(result.created).toBe(false);
      expect(builders.gateways.insert).not.toHaveBeenCalled();
      expect(builders.gateways.update).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'fac-1',
          name: 'North Depot',
        }),
      );
    });

    it('preserves an operator-set display name on rebind', async () => {
      const { builders } = buildTrx({
        existingBound: null,
        existingRow: {
          id: 'guid-2',
          facility_id: null,
          name: 'Front Gate Hub',
          metadata: JSON.stringify({ displayNameSetByOperator: true }),
        },
        facilityName: 'North Depot',
      });

      await model.createOrBindAsFirstGateway({
        id: 'guid-2',
        facilityId: 'fac-1',
      });

      expect(builders.gateways.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Front Gate Hub',
        }),
      );
    });

    it('returns bound:false when a bound gateway already exists (race lost)', async () => {
      const { builders } = buildTrx({
        existingBound: { id: 'existing-bound', facility_id: 'fac-1' },
        existingRow: null,
      });

      const result = await model.createOrBindAsFirstGateway({
        id: 'guid-3',
        facilityId: 'fac-1',
      });

      expect(result.bound).toBe(false);
      expect(result.created).toBe(false);
      expect(builders.gateways.insert).not.toHaveBeenCalled();
      expect(builders.gateways.update).not.toHaveBeenCalled();
    });
  });
});
