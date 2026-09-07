/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useAfterFacilityDeleted } from '@/hooks/useAfterFacilityDeleted';

const mockNavigate = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: () => ({
    refresh: mockRefresh,
  }),
}));

describe('useAfterFacilityDeleted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('clears persisted selection, refreshes facilities, then opens dashboard', async () => {
    localStorage.setItem('selectedFacilityId', 'fac-deleted');
    const { result } = renderHook(() => useAfterFacilityDeleted());

    await act(async () => {
      await result.current();
    });

    expect(localStorage.getItem('selectedFacilityId')).toBeNull();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
