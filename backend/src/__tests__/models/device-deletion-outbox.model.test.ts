import { DeviceDeletionOutboxModel } from '@/models/device-deletion-outbox.model';

describe('DeviceDeletionOutboxModel', () => {
  let model: DeviceDeletionOutboxModel;
  let mockBuilder: Record<string, jest.Mock>;
  let mockKnex: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new DeviceDeletionOutboxModel();

    mockBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(1),
    };

    mockKnex = jest.fn(() => mockBuilder) as jest.Mock;
    (model as unknown as { db: { connection: jest.Mock } }).db = { connection: mockKnex };
  });

  it('findLatestForBlulok returns the newest row for facility + lock_id', async () => {
    const row = {
      id: 'outbox-1',
      facility_id: 'fac-1',
      device_kind: 'blulok',
      lock_id: 'LOCK-1',
      status: 'delivered',
    };
    mockBuilder.first.mockResolvedValue(row);

    const result = await model.findLatestForBlulok('fac-1', 'LOCK-1');

    expect(result).toEqual(row);
    expect(mockKnex).toHaveBeenCalledWith('device_deletion_outbox');
    expect(mockBuilder.where).toHaveBeenCalledWith('facility_id', 'fac-1');
    expect(mockBuilder.where).toHaveBeenCalledWith('device_kind', 'blulok');
    expect(mockBuilder.where).toHaveBeenCalledWith('lock_id', 'LOCK-1');
    expect(mockBuilder.orderBy).toHaveBeenCalledWith('updated_at', 'desc');
  });

  it('findActiveForBlulok filters to active statuses only', async () => {
    mockBuilder.first.mockResolvedValue(null);

    await model.findActiveForBlulok('fac-1', 'LOCK-2');

    expect(mockBuilder.whereIn).toHaveBeenCalledWith('status', ['pending', 'in_progress', 'failed']);
  });

  it('findLatestForAccessControl scopes by access_id and relay_channel', async () => {
    mockBuilder.first.mockResolvedValue(null);

    await model.findLatestForAccessControl('fac-1', 'KP-001', 3);

    expect(mockBuilder.where).toHaveBeenCalledWith('device_kind', 'access_control');
    expect(mockBuilder.where).toHaveBeenCalledWith('access_id', 'KP-001');
    expect(mockBuilder.where).toHaveBeenCalledWith('relay_channel', 3);
  });
});
