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
});
