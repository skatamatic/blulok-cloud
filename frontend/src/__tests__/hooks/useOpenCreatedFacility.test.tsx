/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useOpenCreatedFacility } from '@/hooks/useOpenCreatedFacility';

const mockNavigate = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockSetSelectedFacilityId = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: () => ({
    refresh: mockRefresh,
    setSelectedFacilityId: mockSetSelectedFacilityId,
  }),
}));

describe('useOpenCreatedFacility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects the new facility, refreshes the list, then opens facility setup', async () => {
    const { result } = renderHook(() => useOpenCreatedFacility());

    await act(async () => {
      await result.current('fac-new');
    });

    expect(mockSetSelectedFacilityId).toHaveBeenCalledWith('fac-new');
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/facilities/fac-new');
    expect(mockSetSelectedFacilityId.mock.invocationCallOrder[0]).toBeLessThan(
      mockRefresh.mock.invocationCallOrder[0],
    );
  });
});
