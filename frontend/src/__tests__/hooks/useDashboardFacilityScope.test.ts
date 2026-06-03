import { renderHook } from '@testing-library/react';
import { useDashboardFacilityScope } from '@/hooks/useDashboardFacilityScope';

const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useDashboardFacilityScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no API facility filter for global admin in all-facilities mode', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          role: 'dev_admin',
          facilityIds: ['fac-a', 'fac-b'],
        },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope(undefined));

    expect(result.current.facilityIdsForApi).toBeUndefined();
    expect(result.current.wsFilters).toBeUndefined();
    expect(result.current.matchesFacilityScope('fac-a')).toBe(true);
  });

  it('returns assigned facility IDs for facility admin in all-facilities mode', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          role: 'facility_admin',
          facilityIds: ['fac-a', 'fac-b'],
        },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope(undefined));

    expect(result.current.facilityIdsForApi).toEqual(['fac-a', 'fac-b']);
    expect(result.current.wsFilters).toEqual({ facilityIds: ['fac-a', 'fac-b'] });
    expect(result.current.matchesFacilityScope('fac-a')).toBe(true);
    expect(result.current.matchesFacilityScope('fac-other')).toBe(false);
  });

  it('scopes to a single facility when facility filter is set', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          role: 'facility_admin',
          facilityIds: ['fac-a', 'fac-b'],
        },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope('fac-a'));

    expect(result.current.facilityIdsForApi).toEqual(['fac-a']);
    expect(result.current.wsFilters).toEqual({ facilityId: 'fac-a' });
    expect(result.current.matchesFacilityScope('fac-a')).toBe(true);
    expect(result.current.matchesFacilityScope('fac-b')).toBe(false);
  });
});
