/**
 * GatewayFirmwareTab Component Tests
 *
 * Covers: loading state, data hydration, WS progress subscription,
 * target type filtering, push flow, cancel flow, push history, and
 * browser-reload resilience.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GatewayFirmwareTab from '@/components/Gateway/GatewayFirmwareTab';
import { apiService } from '@/services/api.service';

// ─── Mocks ────────────────────────────────────────────────────────────────

jest.mock('@/services/api.service');
const mockApi = apiService as jest.Mocked<typeof apiService>;

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

let wsMessageHandler: ((data: any) => void) | null = null;
const mockSubscribe = jest.fn().mockImplementation((_type: string, handler: (data: any) => void) => {
  wsMessageHandler = handler;
  return 'sub-id-1';
});
const mockUnsubscribe = jest.fn();

const stableWsValue = {
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  isConnected: true,
};

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: () => stableWsValue,
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const GATEWAY_ID = 'gw-1';

const mkFirmware = (overrides: Partial<any> = {}) => ({
  id: 'fw-1',
  version: '2.0.0',
  target_type: 'gateway',
  filename: 'test.bin',
  sha256_hash: 'abc123',
  size_bytes: 524288,
  description: 'Test firmware',
  compatible_models: ['BLK-100'],
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const mkPush = (overrides: Partial<any> = {}) => ({
  id: 'push-1',
  firmware_id: 'fw-1',
  gateway_id: GATEWAY_ID,
  facility_id: 'fac-1',
  target_type: 'gateway',
  status: 'complete',
  chunks_total: 2,
  chunks_sent: 2,
  progress_percent: 0,
  devices_complete: 0,
  devices_failed: 0,
  initiated_by: 'user-1',
  created_at: '2026-01-02T00:00:00Z',
  ...overrides,
});

function setupDefaultMocks(overrides: {
  firmware?: any[];
  pushStatus?: any;
  pushHistory?: any[];
} = {}) {
  mockApi.listFirmware.mockResolvedValue({ data: overrides.firmware ?? [mkFirmware()] });
  mockApi.getFirmwarePushStatus.mockResolvedValue({ data: overrides.pushStatus ?? null });
  mockApi.getFirmwarePushHistory.mockResolvedValue({ data: overrides.pushHistory ?? [] });
}

function renderTab(props: Partial<React.ComponentProps<typeof GatewayFirmwareTab>> = {}) {
  return render(
    <GatewayFirmwareTab
      gatewayId={GATEWAY_ID}
      currentFirmwareVersion="1.9.0"
      gatewayModel="BLK-100"
      {...props}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('GatewayFirmwareTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wsMessageHandler = null;
  });

  // ── Loading ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows skeleton while data is loading', () => {
      setupDefaultMocks();
      renderTab();
      // Skeleton has animated pulse divs, not the firmware cards
      expect(screen.queryByText('Available Firmware')).not.toBeInTheDocument();
    });

    it('resolves to content after load', async () => {
      setupDefaultMocks();
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });
    });
  });

  // ── Data display ─────────────────────────────────────────────────────

  describe('data display', () => {
    it('lists firmware with version, size, and description', async () => {
      setupDefaultMocks();
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
        expect(screen.getByText('512.0 KB')).toBeInTheDocument();
        expect(screen.getByText('Test firmware')).toBeInTheDocument();
      });
    });

    it('shows "Current" badge for matching firmware version', async () => {
      setupDefaultMocks({ firmware: [mkFirmware({ version: '1.9.0' })] });
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('Current')).toBeInTheDocument();
      });
    });

    it('shows empty state when no firmware available', async () => {
      setupDefaultMocks({ firmware: [] });
      renderTab();
      await waitFor(() => {
        expect(screen.getByText(/No gateway firmware available/i)).toBeInTheDocument();
      });
    });

    it('shows current firmware version for gateway tab', async () => {
      setupDefaultMocks({ firmware: [mkFirmware({ compatible_models: [] })] });
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('v1.9.0')).toBeInTheDocument();
        expect(screen.getByText('BLK-100')).toBeInTheDocument();
      });
    });

    it('shows placeholder text for non-gateway current firmware', async () => {
      setupDefaultMocks({ firmware: [mkFirmware({ target_type: 'lock' })] });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });

      // Switch to lock tab
      fireEvent.click(screen.getByText('Lock'));

      await waitFor(() => {
        expect(screen.getByText(/Lock firmware version is reported by the gateway/i)).toBeInTheDocument();
      });
    });
  });

  // ── API calls ────────────────────────────────────────────────────────

  describe('API usage', () => {
    it('calls listFirmware, getPushStatus, getPushHistory with target type on load', async () => {
      setupDefaultMocks();
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });
      expect(mockApi.listFirmware).toHaveBeenCalledWith('gateway');
      expect(mockApi.getFirmwarePushStatus).toHaveBeenCalledWith(GATEWAY_ID, 'gateway', false);
      expect(mockApi.getFirmwarePushHistory).toHaveBeenCalledWith(GATEWAY_ID, 'gateway', 10);
    });

    it('reloads data when target type tab changes', async () => {
      setupDefaultMocks();
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });
      jest.clearAllMocks();
      setupDefaultMocks({ firmware: [mkFirmware({ target_type: 'lock' })] });

      fireEvent.click(screen.getByText('Lock'));

      await waitFor(() => {
        expect(mockApi.listFirmware).toHaveBeenCalledWith('lock');
        expect(mockApi.getFirmwarePushStatus).toHaveBeenCalledWith(GATEWAY_ID, 'lock', false);
      });
    });

    it('shows error toast on API failure', async () => {
      mockApi.listFirmware.mockRejectedValue(new Error('Network'));
      mockApi.getFirmwarePushStatus.mockRejectedValue(new Error('Network'));
      mockApi.getFirmwarePushHistory.mockRejectedValue(new Error('Network'));
      renderTab();
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error', title: 'Failed to load firmware data' }),
        );
      });
    });
  });

  // ── Push flow ────────────────────────────────────────────────────────

  describe('push flow', () => {
    it('shows confirm/cancel buttons when Push is clicked, then initiates push on Confirm', async () => {
      setupDefaultMocks();
      mockApi.pushFirmware.mockResolvedValue({ data: mkPush({ status: 'pending' }) });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      });

      // Click Push
      fireEvent.click(screen.getByText('Push'));
      expect(screen.getByText('Confirm')).toBeInTheDocument();

      // Click Confirm
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(mockApi.pushFirmware).toHaveBeenCalledWith('fw-1', GATEWAY_ID);
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'success', title: 'Firmware push initiated' }),
        );
      });
    });

    it('does not send facilityId in push request', async () => {
      setupDefaultMocks();
      mockApi.pushFirmware.mockResolvedValue({ data: mkPush({ status: 'pending' }) });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Push')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Push'));
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        // pushFirmware should only be called with firmwareId and gatewayId (no facilityId)
        expect(mockApi.pushFirmware).toHaveBeenCalledWith('fw-1', GATEWAY_ID);
      });
    });

    it('disables Push button when there is an active transfer', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 1 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      const pushBtn = screen.getByText('Push');
      expect(pushBtn).toBeDisabled();
    });

    it('shows error toast on push failure', async () => {
      setupDefaultMocks();
      mockApi.pushFirmware.mockRejectedValue({
        response: { data: { message: 'Gateway is offline' } },
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Push')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Push'));
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error', title: 'Gateway is offline' }),
        );
      });
    });
  });

  // ── Cancel flow ──────────────────────────────────────────────────────

  describe('cancel flow', () => {
    it('cancels an active push', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 1 }),
      });
      mockApi.cancelFirmwarePush.mockResolvedValue({ success: true });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(mockApi.cancelFirmwarePush).toHaveBeenCalledWith('push-1');
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'info', title: 'Push cancellation requested' }),
        );
      });
    });
  });

  // ── Progress monitoring (WS) ─────────────────────────────────────────

  describe('WebSocket progress', () => {
    it('subscribes to firmware_push_progress on mount', async () => {
      setupDefaultMocks();
      renderTab();
      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });
      expect(mockSubscribe).toHaveBeenCalledWith('firmware_push_progress', expect.any(Function));
    });

    it('unsubscribes on unmount', async () => {
      setupDefaultMocks();
      const { unmount } = renderTab();
      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledWith('sub-id-1');
    });

    it('updates live progress when WS message matches gatewayId and targetType', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 0 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      // Simulate WS progress
      act(() => {
        wsMessageHandler?.({
          gatewayId: GATEWAY_ID,
          targetType: 'gateway',
          step: 'transferring',
          percent: 50,
          chunksTotal: 2,
          chunksSent: 1,
        });
      });

      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('1/2 chunks')).toBeInTheDocument();
    });

    it('ignores WS messages with wrong gatewayId', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 0 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      act(() => {
        wsMessageHandler?.({
          gatewayId: 'other-gateway',
          targetType: 'gateway',
          step: 'transferring',
          percent: 99,
        });
      });

      // Should still show 0% from initial hydration
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('ignores WS messages with wrong targetType (cross-type filtering)', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 0 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      // Send a lock progress update while on the gateway tab
      act(() => {
        wsMessageHandler?.({
          gatewayId: GATEWAY_ID,
          targetType: 'lock',
          step: 'transferring',
          percent: 75,
        });
      });

      // Should still show 0% — the lock update should be filtered out
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('refreshes data when terminal WS event received', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 1 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      // Reset only the API mocks so we can detect the re-fetch
      mockApi.listFirmware.mockClear();
      mockApi.getFirmwarePushStatus.mockClear();
      mockApi.getFirmwarePushHistory.mockClear();
      setupDefaultMocks({ pushStatus: mkPush({ status: 'complete' }) });

      // Send a terminal WS event which triggers setTimeout(loadData, 500)
      act(() => {
        wsMessageHandler?.({
          gatewayId: GATEWAY_ID,
          targetType: 'gateway',
          step: 'complete',
          percent: 100,
        });
      });

      // Wait for the 500ms setTimeout + the async loadData to complete
      await waitFor(
        () => expect(mockApi.getFirmwarePushStatus).toHaveBeenCalled(),
        { timeout: 3000 },
      );
    });

    it('deduplicates repeated device IDs in live WS payload', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'transferring', chunks_sent: 0 }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
      });

      act(() => {
        wsMessageHandler?.({
          gatewayId: GATEWAY_ID,
          targetType: 'gateway',
          step: 'verifying',
          percent: 99,
          devicesTotal: 1,
          devices: [
            { device_id: 'dup-device', status: 'pending', progress_percent: 88 },
            { device_id: 'dup-device', status: 'pending', progress_percent: 94 },
            { device_id: 'dup-device', status: 'pending', progress_percent: 97 },
          ],
        });
      });

      expect(screen.getByText('1 device')).toBeInTheDocument();
      expect(screen.getAllByTitle('dup-device')).toHaveLength(1);
      expect(screen.getByText('97%')).toBeInTheDocument();
    });
  });

  // ── Browser reload resilience ────────────────────────────────────────

  describe('browser reload resilience', () => {
    it('hydrates progress from active push status on mount', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({
          status: 'transferring',
          chunks_total: 4,
          chunks_sent: 2,
        }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(screen.getByText('2/4 chunks')).toBeInTheDocument();
      });
    });

    it('does not show progress bar for completed push on mount', async () => {
      setupDefaultMocks({
        pushStatus: mkPush({ status: 'complete' }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });

      expect(screen.queryByText('Firmware Update In Progress')).not.toBeInTheDocument();
    });
  });

  // ── Active push banner ───────────────────────────────────────────────

  describe('active push banner', () => {
    it('shows firmware version and target type in progress banner', async () => {
      setupDefaultMocks({
        firmware: [mkFirmware({ id: 'fw-1', version: '2.0.0' })],
        pushStatus: mkPush({ status: 'transferring', firmware_id: 'fw-1', target_type: 'gateway' }),
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Firmware Update In Progress')).toBeInTheDocument();
        // v2.0.0 appears in both the banner and the firmware list
        const versions = screen.getAllByText('v2.0.0');
        expect(versions.length).toBeGreaterThanOrEqual(2);
        // Gateway appears in tab, banner, and current firmware section
        const gateways = screen.getAllByText('Gateway');
        expect(gateways.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ── Push history ─────────────────────────────────────────────────────

  describe('push history', () => {
    it('renders push history with status badges', async () => {
      setupDefaultMocks({
        pushHistory: [
          mkPush({ id: 'p1', status: 'complete' }),
          mkPush({ id: 'p2', status: 'failed', error_message: 'Chunk 0 timeout' }),
        ],
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Push History')).toBeInTheDocument();
        expect(screen.getByText('complete')).toBeInTheDocument();
        expect(screen.getByText('failed')).toBeInTheDocument();
        expect(screen.getByText('Chunk 0 timeout')).toBeInTheDocument();
      });
    });

    it('shows "Deleted firmware" for push referencing soft-deleted firmware', async () => {
      setupDefaultMocks({
        firmware: [], // firmware was deleted
        pushHistory: [mkPush({ firmware_id: 'fw-deleted' })],
      });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Deleted firmware')).toBeInTheDocument();
      });
    });

    it('shows Load More button when history page is full', async () => {
      const fullPage = Array.from({ length: 10 }, (_, i) =>
        mkPush({ id: `p-${i}`, status: 'complete' }),
      );
      setupDefaultMocks({ pushHistory: fullPage });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Load More')).toBeInTheDocument();
      });
    });

    it('loads more history when Load More is clicked', async () => {
      const fullPage = Array.from({ length: 10 }, (_, i) =>
        mkPush({ id: `p-${i}`, status: 'complete' }),
      );
      setupDefaultMocks({ pushHistory: fullPage });
      mockApi.getFirmwarePushHistory.mockResolvedValueOnce({ data: fullPage }); // initial
      mockApi.getFirmwarePushHistory.mockResolvedValueOnce({ data: [mkPush({ id: 'p-extra' })] }); // load more
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Load More')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Load More'));

      await waitFor(() => {
        // The load-more call should use offset = 10
        expect(mockApi.getFirmwarePushHistory).toHaveBeenLastCalledWith(GATEWAY_ID, 'gateway', 10, 10);
      });
    });

    it('hides push history section when empty', async () => {
      setupDefaultMocks({ pushHistory: [] });
      renderTab();

      await waitFor(() => {
        expect(screen.getByText('Available Firmware')).toBeInTheDocument();
      });

      expect(screen.queryByText('Push History')).not.toBeInTheDocument();
    });
  });
});
