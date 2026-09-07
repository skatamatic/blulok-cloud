import { renderHook } from '@testing-library/react';
import { useDashboardFacilityScope } from '@/hooks/useDashboardFacilityScope';

const mockUseAuth = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

describe('useDashboardFacilityScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      facilities: [
        { id: 'fac-a', name: 'A' },
        { id: 'fac-b', name: 'B' },
      ],
    });
  });

  it('returns no API facility filter for global admin in all-facilities mode', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: { role: 'dev_admin' },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope(undefined));

    expect(result.current.facilityIdsForApi).toBeUndefined();
    expect(result.current.wsFilters).toBeUndefined();
    expect(result.current.matchesFacilityScope('fac-a')).toBe(true);
  });

  it('returns live facility IDs for facility admin in all-facilities mode', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: { role: 'facility_admin' },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope(undefined));

    expect(result.current.facilityIdsForApi).toEqual(['fac-a', 'fac-b']);
    expect(result.current.wsFilters).toEqual({ facilityIds: ['fac-a', 'fac-b'] });
  });

  it('returns a single facility when a facility filter is selected', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: { role: 'facility_admin' },
      },
    });

    const { result } = renderHook(() => useDashboardFacilityScope('fac-a'));

    expect(result.current.facilityIdsForApi).toEqual(['fac-a']);
    expect(result.current.wsFilters).toEqual({ facilityId: 'fac-a' });
  });
});
