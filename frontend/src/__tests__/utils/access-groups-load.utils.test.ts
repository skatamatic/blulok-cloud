import { loadAccessGroupRefsForBlulokLock } from '@/utils/access-groups-load.utils';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getDeviceGroups: jest.fn(),
    getDeviceGroup: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('access-groups-load.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves blulok groups by device id even when member device_type is access_control', async () => {
    mockApi.getDeviceGroups.mockResolvedValue({
      data: [{ id: 'group-1', name: 'Test Group', is_default: false }],
    } as any);
    mockApi.getDeviceGroup.mockResolvedValue({
      data: {
        id: 'group-1',
        name: 'Test Group',
        is_default: false,
        members: [{ device_id: 'lock-1', device_type: 'access_control' }],
      },
    } as any);

    const refs = await loadAccessGroupRefsForBlulokLock('facility-1', 'lock-1', 'unit-1');

    expect(refs).toEqual([{ id: 'group-1', name: 'Test Group', is_default: false }]);
  });

  it('resolves blulok groups by source unit id', async () => {
    mockApi.getDeviceGroups.mockResolvedValue({
      data: [{ id: 'group-2', name: 'Wing A', is_default: false }],
    } as any);
    mockApi.getDeviceGroup.mockResolvedValue({
      data: {
        id: 'group-2',
        name: 'Wing A',
        is_default: false,
        members: [{ device_id: 'other-lock', device_type: 'blulok', source_unit_id: 'unit-9' }],
      },
    } as any);

    const refs = await loadAccessGroupRefsForBlulokLock('facility-1', 'lock-1', 'unit-9');

    expect(refs).toEqual([{ id: 'group-2', name: 'Wing A', is_default: false }]);
  });
});
