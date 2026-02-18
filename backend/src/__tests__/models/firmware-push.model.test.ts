/**
 * FirmwarePushModel Unit Tests
 */

import { FirmwarePushModel, FirmwarePush } from '@/models/firmware-push.model';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-push-id') }));

const mockPushRow = {
  id: 'push-1',
  firmware_id: 'fw-1',
  gateway_id: 'gw-1',
  facility_id: 'fac-1',
  target_type: 'gateway',
  status: 'pending',
  chunks_total: null,
  chunks_sent: 0,
  error_message: undefined,
  initiated_by: 'user-1',
  started_at: undefined,
  completed_at: undefined,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
};

describe('FirmwarePushModel', () => {
  let model: FirmwarePushModel;
  let mockBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new FirmwarePushModel();

    mockBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
    };
    mockBuilder.then = jest.fn((resolve: (value: any) => void) => resolve([mockPushRow]));

    (model as any).db = { connection: jest.fn(() => mockBuilder) };
  });

  describe('findById', () => {
    it('should return push by id', async () => {
      mockBuilder.first.mockResolvedValue(mockPushRow);
      const result = await model.findById('push-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'push-1');
      expect(result).toEqual(mockPushRow);
    });

    it('should return null when not found', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('findByGatewayId', () => {
    it('should return pushes for a gateway ordered by created_at desc with default limit/offset', async () => {
      const result = await model.findByGatewayId('gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockBuilder.limit).toHaveBeenCalledWith(50);
      expect(mockBuilder.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual([mockPushRow]);
    });

    it('should filter by target_type when provided', async () => {
      await model.findByGatewayId('gw-1', 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
    });

    it('should pass limit and offset to query', async () => {
      await model.findByGatewayId('gw-1', undefined, 20, 10);
      expect(mockBuilder.limit).toHaveBeenCalledWith(20);
      expect(mockBuilder.offset).toHaveBeenCalledWith(10);
    });
  });

  describe('findActiveByGateway', () => {
    it('should return non-terminal push', async () => {
      mockBuilder.first.mockResolvedValue(mockPushRow);
      const result = await model.findActiveByGateway('gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.whereNotIn).toHaveBeenCalledWith('status', ['complete', 'failed', 'cancelled']);
      expect(result).toEqual(mockPushRow);
    });

    it('should filter by target_type when provided', async () => {
      mockBuilder.first.mockResolvedValue({ ...mockPushRow, target_type: 'lock' });
      const result = await model.findActiveByGateway('gw-1', 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
      expect(mockBuilder.whereNotIn).toHaveBeenCalledWith('status', ['complete', 'failed', 'cancelled']);
      expect(result).not.toBeNull();
    });

    it('should return null when no active push', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findActiveByGateway('gw-1');
      expect(result).toBeNull();
    });

    it('active push check is scoped by target_type (lock push does not block gateway push)', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findActiveByGateway('gw-1', 'gateway');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'gateway');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert a push record with status pending', async () => {
      const findByIdSpy = jest.spyOn(model, 'findById').mockResolvedValue({
        ...mockPushRow,
        id: 'test-push-id',
        target_type: 'gateway',
      } as FirmwarePush);

      await model.create({
        firmware_id: 'fw-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        initiated_by: 'user-1',
      });

      expect(mockBuilder.insert).toHaveBeenCalled();
      const insertArg = mockBuilder.insert.mock.calls[0][0];
      expect(insertArg.id).toBe('test-push-id');
      expect(insertArg.status).toBe('pending');
      expect(insertArg.chunks_sent).toBe(0);
      expect(insertArg.target_type).toBe('gateway');
      findByIdSpy.mockRestore();
    });

    it('should insert with target_type when provided', async () => {
      const findByIdSpy = jest.spyOn(model, 'findById').mockResolvedValue({
        ...mockPushRow,
        id: 'test-push-id',
        target_type: 'lock',
      } as FirmwarePush);

      await model.create({
        firmware_id: 'fw-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        target_type: 'lock',
        initiated_by: 'user-1',
      });

      const insertArg = mockBuilder.insert.mock.calls[0][0];
      expect(insertArg.target_type).toBe('lock');
      findByIdSpy.mockRestore();
    });
  });

  describe('updateProgress', () => {
    it('should update chunks_sent', async () => {
      await model.updateProgress('push-1', 5);
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'push-1');
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.chunks_sent).toBe(5);
    });
  });

  describe('updateStatus', () => {
    it('should set started_at when transitioning to transferring', async () => {
      await model.updateStatus('push-1', 'transferring');
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.status).toBe('transferring');
      expect(updateArg.started_at).toBeDefined();
    });

    it('should set completed_at on terminal status', async () => {
      await model.updateStatus('push-1', 'complete');
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.status).toBe('complete');
      expect(updateArg.completed_at).toBeDefined();
    });

    it('should set error_message on failure', async () => {
      await model.updateStatus('push-1', 'failed', 'Chunk 3 failed');
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.status).toBe('failed');
      expect(updateArg.error_message).toBe('Chunk 3 failed');
      expect(updateArg.completed_at).toBeDefined();
    });

    it('should not set started_at on non-transferring status', async () => {
      await model.updateStatus('push-1', 'complete');
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.started_at).toBeUndefined();
    });
  });

  describe('updateChunksTotal', () => {
    it('should update chunks_total', async () => {
      await model.updateChunksTotal('push-1', 10);
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.chunks_total).toBe(10);
    });
  });

  describe('atomicCancel', () => {
    it('should update status to cancelled when push is non-terminal and return true', async () => {
      mockBuilder.update.mockResolvedValue(1);
      const result = await model.atomicCancel('push-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'push-1');
      expect(mockBuilder.whereNotIn).toHaveBeenCalledWith('status', ['complete', 'failed', 'cancelled']);
      expect(mockBuilder.update).toHaveBeenCalled();
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.status).toBe('cancelled');
      expect(updateArg.completed_at).toBeDefined();
      expect(result).toBe(true);
    });

    it('should return false when push is already terminal (no rows updated)', async () => {
      mockBuilder.update.mockResolvedValue(0);
      const result = await model.atomicCancel('push-1');
      expect(result).toBe(false);
    });
  });

  describe('findByFacilityAndTargetType', () => {
    it('should return most recent push for facility and target_type', async () => {
      mockBuilder.then = jest.fn((resolve: (value: any) => void) => resolve([{ ...mockPushRow, facility_id: 'fac-1', target_type: 'gateway' }]));
      const result = await model.findByFacilityAndTargetType('fac-1', 'gateway');
      expect(mockBuilder.where).toHaveBeenCalledWith('facility_id', 'fac-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'gateway');
      expect(mockBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockBuilder.limit).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(1);
      expect(result[0].target_type).toBe('gateway');
    });
  });

  describe('findLatestByGateway', () => {
    it('should return most recent push regardless of status', async () => {
      mockBuilder.first.mockResolvedValue({ ...mockPushRow, status: 'complete' });
      const result = await model.findLatestByGateway('gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(result!.status).toBe('complete');
    });

    it('should filter by target_type when provided', async () => {
      mockBuilder.first.mockResolvedValue({ ...mockPushRow, target_type: 'lock', status: 'complete' });
      const result = await model.findLatestByGateway('gw-1', 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('gateway_id', 'gw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
      expect(result!.target_type).toBe('lock');
    });
  });
});
