import { FacilityProvisioningFileModel } from '@/models/facility-provisioning-file.model';
import { PROVISIONING_MAX_FILES_PER_FACILITY } from '@/constants/provisioning.constants';

describe('FacilityProvisioningFileModel retention helpers', () => {
  let model: FacilityProvisioningFileModel;
  let mockKnex: jest.Mock;
  let mockBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new FacilityProvisioningFileModel();
    mockBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      pluck: jest.fn(),
      distinct: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
    };
    mockKnex = jest.fn(() => mockBuilder);
    (model as any).db = { connection: mockKnex };
  });

  it('findIdsBeyondRetention returns ids not in the newest keep set', async () => {
    mockBuilder.pluck
      .mockResolvedValueOnce(['keep-1', 'keep-2'])
      .mockResolvedValueOnce(['old-1', 'old-2']);

    const ids = await model.findIdsBeyondRetention('fac-1', 2);

    expect(mockBuilder.where).toHaveBeenCalledWith('facility_id', 'fac-1');
    expect(mockBuilder.limit).toHaveBeenCalledWith(2);
    expect(mockBuilder.whereNotIn).toHaveBeenCalledWith('id', ['keep-1', 'keep-2']);
    expect(ids).toEqual(['old-1', 'old-2']);
    expect(PROVISIONING_MAX_FILES_PER_FACILITY).toBe(50);
  });

  it('listDistinctFacilityIds returns facility ids', async () => {
    mockBuilder.distinct.mockResolvedValue([
      { facility_id: 'fac-1' },
      { facility_id: 'fac-2' },
    ]);
    const ids = await model.listDistinctFacilityIds();
    expect(ids).toEqual(['fac-1', 'fac-2']);
  });
});
