import { FirmwareModel } from '@/models/firmware.model';
import { FIRMWARE_IMAGES_RETENTION_PER_TARGET } from '@/constants/firmware-retention.constants';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-firmware-id') }));

describe('FirmwareModel retention helpers', () => {
  let model: FirmwareModel;
  let mockKnex: jest.Mock;
  let mockBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new FirmwareModel();
    mockBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      pluck: jest.fn(),
      distinct: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    mockKnex = jest.fn(() => mockBuilder);
    (model as any).db = { connection: mockKnex };
  });

  it('findActiveIdsBeyondRetention returns ids not in the newest keep set', async () => {
    mockBuilder.pluck
      .mockResolvedValueOnce(['new-1', 'new-2'])
      .mockResolvedValueOnce(['old-1']);

    const ids = await model.findActiveIdsBeyondRetention('lock', 2);

    expect(mockBuilder.where).toHaveBeenCalledWith('is_active', true);
    expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
    expect(mockBuilder.limit).toHaveBeenCalledWith(2);
    expect(mockBuilder.whereNotIn).toHaveBeenCalledWith('id', ['new-1', 'new-2']);
    expect(ids).toEqual(['old-1']);
    expect(FIRMWARE_IMAGES_RETENTION_PER_TARGET).toBe(50);
  });

  it('findActiveIdsBeyondRetention returns empty when keep covers all', async () => {
    mockBuilder.pluck.mockResolvedValueOnce(['a', 'b']);
    mockBuilder.pluck.mockResolvedValueOnce([]);
    const ids = await model.findActiveIdsBeyondRetention('gateway', 50);
    expect(ids).toEqual([]);
  });

  it('hardDelete deletes by id', async () => {
    mockBuilder.del.mockResolvedValue(1);
    await expect(model.hardDelete('fw-1')).resolves.toBe(true);
    expect(mockKnex).toHaveBeenCalledWith('firmware_images');
    expect(mockBuilder.where).toHaveBeenCalledWith('id', 'fw-1');
  });
});
