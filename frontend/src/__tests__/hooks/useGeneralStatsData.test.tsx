/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGeneralStatsData } from '@/hooks/useGeneralStatsData';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { apiService } from '@/services/api.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: jest.fn(),
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getDashboardGeneralStats: jest.fn(),
  },
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseGlobalFacility = useGlobalFacility as jest.MockedFunction<typeof useGlobalFacility>;
const mockGetStats = apiService.getDashboardGeneralStats as jest.MockedFunction<typeof apiService.getDashboardGeneralStats>;

const statsPayload = {
  facilities: { total: 1, active: 1, inactive: 0, maintenance: 0 },
  devices: { total: 2, online: 2, offline: 0, error: 0, maintenance: 0 },
  users: {
    total: 3,
    active: 3,
    inactive: 0,
    byRole: {
      [UserRole.TENANT]: 0,
      [UserRole.ADMIN]: 1,
      [UserRole.DEV_ADMIN]: 0,
      [UserRole.FACILITY_ADMIN]: 1,
      [UserRole.MAINTENANCE]: 0,
      [UserRole.BLULOK_TECHNICIAN]: 1,
    },
  },
  alerts: { open: 0 },
  lastUpdated: '2026-01-01T00:00:00.000Z',
  scope: { type: 'all' as const },
};

function setupAuth(role: UserRole = UserRole.ADMIN) {
  mockUseAuth.mockReturnValue({
    authState: {
      user: { id: 'user-1', email: 'a@b.com', firstName: 'A', lastName: 'B', role },
      isAuthenticated: true,
      isLoading: false,
    },
    login: jest.fn(),
    logout: jest.fn(),
    hasRole: jest.fn(),
    isAdmin: jest.fn(),
    canManageUsers: jest.fn(),
  } as never);
}

describe('useGeneralStatsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth(UserRole.ADMIN);
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: ALL_FACILITIES_ID,
      selectedFacility: null,
      setSelectedFacilityId: jest.fn(),
      facilities: [],
      isLoading: false,
      hasMultipleFacilities: false,
      isAllFacilitiesSelected: true,
      refresh: jest.fn(),
    } as never);
    mockGetStats.mockResolvedValue({ success: true, data: statsPayload });
  });

  it('loads aggregate stats when “all facilities” is selected', async () => {
    const { result } = renderHook(() => useGeneralStatsData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetStats).toHaveBeenCalledWith(undefined);
    expect(result.current.stats).toEqual(statsPayload);
    expect(result.current.error).toBeNull();
    expect(result.current.canAccess).toBe(true);
  });

  it('passes facility_id when a single facility is selected', async () => {
    const fid = '550e8400-e29b-41d4-a716-446655440001';
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: fid,
      selectedFacility: { id: fid, name: 'F1' } as never,
      setSelectedFacilityId: jest.fn(),
      facilities: [],
      isLoading: false,
      hasMultipleFacilities: true,
      isAllFacilitiesSelected: false,
      refresh: jest.fn(),
    } as never);

    const { result } = renderHook(() => useGeneralStatsData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetStats).toHaveBeenCalledWith({ facility_id: fid });
    expect(result.current.stats).toEqual(statsPayload);
  });

  it('does not apply WebSocket stats updates when facility-scoped', async () => {
    const fid = '550e8400-e29b-41d4-a716-446655440001';
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: fid,
      selectedFacility: null,
      setSelectedFacilityId: jest.fn(),
      facilities: [],
      isLoading: false,
      hasMultipleFacilities: true,
      isAllFacilitiesSelected: false,
      refresh: jest.fn(),
    } as never);

    const { result } = renderHook(() => useGeneralStatsData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const wsPayload = { ...statsPayload, lastUpdated: '2099-01-01T00:00:00.000Z' };
    act(() => {
      result.current.getHandlers().onData(wsPayload);
    });

    expect(result.current.stats?.lastUpdated).toBe(statsPayload.lastUpdated);
  });

  it('applies WebSocket stats updates when aggregate (all facilities)', async () => {
    const { result } = renderHook(() => useGeneralStatsData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const wsPayload = { ...statsPayload, lastUpdated: '2099-01-01T00:00:00.000Z' };
    act(() => {
      result.current.getHandlers().onData(wsPayload);
    });

    expect(result.current.stats?.lastUpdated).toBe('2099-01-01T00:00:00.000Z');
  });

  it('sets canAccess false and skips fetch for tenant', async () => {
    setupAuth(UserRole.TENANT);

    const { result } = renderHook(() => useGeneralStatsData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetStats).not.toHaveBeenCalled();
    expect(result.current.stats).toBeNull();
    expect(result.current.canAccess).toBe(false);
  });
});
