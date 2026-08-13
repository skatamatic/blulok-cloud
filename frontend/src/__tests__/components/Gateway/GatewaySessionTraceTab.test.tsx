import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GatewaySessionTraceTab } from '@/components/Gateway/GatewaySessionTraceTab';
import { apiService } from '@/services/api.service';

const mockSubscribe = jest.fn(() => 'sub-trace-1');
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: jest.fn(),
  }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewaySessionTrace: jest.fn(),
  },
}));

const snapshot = {
  captured_at: '2026-08-12T19:21:00.000Z',
  process: { pid: 1, hostname: 'test', note: 'local' },
  gateway: { id: 'gw-1', name: 'GW', facility_id: 'fac-1', status: 'online' },
  filters: { facility_id: 'fac-1', gateway_id: 'gw-1' },
  rules: ['One physical access should become one access_sessions row'],
  live_sessions: [
    {
      id: 's1',
      state: 'pending',
      method: 'mobile_key',
      origin: 'on_site',
      unit_number: '102',
      actor_name: 'Tester One',
      actor_user_email: 't1@blulok.com',
      device_id: 'dev-1',
      started_at: '2026-08-12T19:21:00.000Z',
    },
  ],
  recent_sessions: [],
  raw_events: [],
  pending_attributions: [],
  lock_states: [
    {
      id: 'dev-1',
      device_type: 'blulok',
      unit_number: '102',
      lock_status: 'locked',
      device_status: 'online',
    },
  ],
  correlator_decisions: [],
  lookups: {
    devices: { 'dev-1': { id: 'dev-1', device_type: 'blulok', unit_number: '102' } },
    units: { 'unit-1': { id: 'unit-1', unit_number: '102' } },
    users: { u1: { id: 'u1', name: 'Tester One', email: 't1@blulok.com' } },
  },
  debug: {
    live_session_count: 1,
    recent_session_count: 0,
    raw_event_count: 0,
    pending_memory_count: 0,
    pending_durable_count: 0,
    correlator_ring_count: 0,
    sessions_sharing_device: [],
  },
};

describe('GatewaySessionTraceTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    (apiService.getGatewaySessionTrace as jest.Mock).mockResolvedValue({
      success: true,
      snapshot,
    });
    mockSubscribe.mockReturnValueOnce('sub-trace-1').mockReturnValueOnce('sub-status-1');
  });

  it('loads snapshot, shows live session, and copies dump', async () => {
    render(<GatewaySessionTraceTab gatewayId="gw-1" facilityId="fac-1" liveEnabled />);

    expect(await screen.findByText('Session trace')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiService.getGatewaySessionTrace).toHaveBeenCalledWith(
        'gw-1',
        expect.objectContaining({}),
      );
    });
    expect((await screen.findAllByText(/Unit 102/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tester One/)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(mockSubscribe).toHaveBeenCalledWith(
      'access_session_trace',
      expect.any(Function),
      undefined,
      expect.objectContaining({
        filters: expect.objectContaining({ facility_id: 'fac-1', gateway_id: 'gw-1' }),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: /copy dump/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const dumped = (navigator.clipboard.writeText as jest.Mock).mock.calls[0][0] as string;
    expect(dumped).toContain('"s1"');
    expect(dumped).toContain('Tester One');
  });
});
