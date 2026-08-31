import { act, renderHook, waitFor } from '@testing-library/react';
import { useFacilityGatewayRecovery } from '@/hooks/useFacilityGatewayRecovery';
import { apiService } from '@/services/api.service';

const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewayRecoveryCandidates: jest.fn(),
  },
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

describe('useFacilityGatewayRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue('sub-1');
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
    expect(mockSubscribe).toHaveBeenCalledWith(
      'gateway_recovery_status',
      expect.any(Function),
      undefined,
      { facility_id: 'fac-1' },
    );
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

  it('retains recovery snapshot when a silent refetch fails', async () => {
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

  it('applies WS status updates without polling', async () => {
    const { result } = renderHook(() => useFacilityGatewayRecovery('fac-1', true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const handler = mockSubscribe.mock.calls[0][1] as (data: unknown) => void;
    act(() => {
      handler({
        facilityId: 'fac-1',
        candidates: [{ gatewayId: 'gw-2', connected: true }],
        sessions: [],
        recovery: { id: 'rec-2', status: 'firmware', facility_id: 'fac-1', gateway_id: 'gw-2' },
      });
    });

    expect(result.current.candidates[0]?.gatewayId).toBe('gw-2');
    expect(result.current.recovery?.status).toBe('firmware');
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useFacilityGatewayRecovery('fac-1', false));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
