/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { useNavigateOnFacilityChange } from '@/hooks/useNavigateOnFacilityChange';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

describe('useNavigateOnFacilityChange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({ pathname: '/units/unit-1', search: '' });
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'fac-1',
      isAllFacilitiesSelected: false,
      isLoading: false,
    });
  });

  it('does not navigate on initial mount', () => {
    renderHook(() => useNavigateOnFacilityChange());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to facility setup when facility changes on a unit detail route', () => {
    const { rerender } = renderHook(() => useNavigateOnFacilityChange());

    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'fac-2',
      isAllFacilitiesSelected: false,
      isLoading: false,
    });
    rerender();

    expect(mockNavigate).toHaveBeenCalledWith('/facilities/fac-2', { replace: true });
  });

  it('navigates to all-facilities hub when All Facilities is selected', () => {
    const { rerender } = renderHook(() => useNavigateOnFacilityChange());

    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      isAllFacilitiesSelected: true,
      isLoading: false,
    });
    rerender();

    expect(mockNavigate).toHaveBeenCalledWith('/facilities', { replace: true });
  });

  it('does not navigate when facility changes on unrelated routes', () => {
    mockUseLocation.mockReturnValue({ pathname: '/dashboard', search: '' });

    const { rerender } = renderHook(() => useNavigateOnFacilityChange());

    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'fac-2',
      isAllFacilitiesSelected: false,
      isLoading: false,
    });
    rerender();

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
