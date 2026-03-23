/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUnitsData } from '@/hooks/useUnitsData';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockGet = apiService.get as jest.MockedFunction<typeof apiService.get>;
const mockPost = apiService.post as jest.MockedFunction<typeof apiService.post>;

const sampleUnits = [
  { id: '1', status: 'occupied' },
  { id: '2', status: 'available' },
  { id: '3', status: 'maintenance' },
  { id: '4', status: 'reserved' },
];

const unlocked = [
  {
    id: '1',
    unit_number: 'A',
    facility_id: 'f',
    facility_name: 'F',
    tenant_id: 't',
    tenant_name: 'T',
    tenant_email: 't@t.com',
    unlocked_since: '',
    last_activity: '',
    lock_status: 'unlocked' as const,
    device_status: 'online' as const,
    battery_level: null,
    auto_lock_enabled: false,
  },
];

describe('useUnitsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(async (url: string, config?: { params?: { facility_id?: string } }) => {
      if (url === '/units') {
        expect(config?.params?.facility_id).toBe('fac-1');
        return { success: true, units: sampleUnits };
      }
      if (url === '/units/unlocked') {
        return { success: true, units: unlocked };
      }
      return { success: false };
    });
  });

  it('loads aggregated stats and passes facility_id when set', async () => {
    const { result } = renderHook(() => useUnitsData('fac-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/units', { params: { facility_id: 'fac-1' } });
    expect(mockGet).toHaveBeenCalledWith('/units/unlocked', { params: { facility_id: 'fac-1' } });
    expect(result.current.data).toMatchObject({
      totalUnits: 4,
      occupiedUnits: 1,
      availableUnits: 1,
      maintenanceUnits: 1,
      reservedUnits: 1,
      unlockedCount: 1,
      lockedCount: 3,
    });
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch not successful', async () => {
    mockGet.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useUnitsData(undefined));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toMatch(/Failed to fetch/);
  });

  it('lockUnit refreshes on success', async () => {
    mockPost.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useUnitsData(undefined));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const ok = await result.current.lockUnit('1');
      expect(ok).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/units/1/lock');
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('onData and onError update state', async () => {
    const { result } = renderHook(() => useUnitsData(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.onError('e');
    });
    expect(result.current.error).toBe('e');

    const payload = result.current.data!;
    act(() => {
      result.current.onData({ ...payload, totalUnits: 99 });
    });
    expect(result.current.data?.totalUnits).toBe(99);
    expect(result.current.error).toBeNull();
  });
});
