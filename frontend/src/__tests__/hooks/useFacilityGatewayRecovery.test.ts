import { act, renderHook, waitFor } from '@testing-library/react';
import { useFacilityGatewayRecovery } from '@/hooks/useFacilityGatewayRecovery';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewayRecoveryCandidates: jest.fn(),
  },
}));

describe('useFacilityGatewayRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [{ gatewayId: 'gw-new', connected: true }],
        recovery: { id: 'rec-1', status: 'detected', facility_id: 'fac-1', gateway_id: 'gw-new' },
      },
    });
  });

  it('loads candidates and sets hasSwapAlert', async () => {
    const { result } = renderHook(() => useFacilityGatewayRecovery('fac-1', true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.hasSwapAlert).toBe(true);
    expect(result.current.isBlocking).toBe(true);
  });

  it('includes failed recovery in hasSwapAlert when no candidate', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [],
        recovery: { id: 'rec-1', status: 'failed', facility_id: 'fac-1', gateway_id: 'gw-new' },
      },
    });

    const { result } = renderHook(() => useFacilityGatewayRecovery('fac-1', true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasSwapAlert).toBe(true);
    expect(result.current.isBlocking).toBe(false);
  });

  it('retains recovery snapshot when a silent poll fails', async () => {
    const { result } = renderHook(() => useFacilityGatewayRecovery('fac-1', true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.recovery?.status).toBe('detected');

    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockRejectedValueOnce(new Error('network'));

    await act(async () => {
      await result.current.refetch({ silent: true });
    });

    expect(result.current.recovery?.status).toBe('detected');
    expect(result.current.candidates).toHaveLength(1);
  });
});
