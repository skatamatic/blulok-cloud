/**
 * GatewayProvisioningTab Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GatewayProvisioningTab from '@/components/Gateway/GatewayProvisioningTab';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');
const mockApi = apiService as jest.Mocked<typeof apiService>;

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { role: 'admin' } },
  }),
}));

const mockSubscribe = jest.fn().mockImplementation((_type: string, _handler: (data: unknown) => void) => 'sub-id-1');
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

const GATEWAY_ID = 'gw-1';

const mkBackup = (overrides: Partial<any> = {}) => ({
  id: 'backup-1',
  gateway_id: GATEWAY_ID,
  facility_id: 'fac-1',
  filename: 'mesh.zip',
  size_bytes: 2048,
  sha256_hash: 'a'.repeat(64),
  upload_source: 'gateway_push',
  created_by: null,
  uploaded_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function setupDefaultMocks(overrides: {
  backups?: any[];
  active?: any;
  history?: any[];
} = {}) {
  mockApi.listGatewayProvisioningBackups.mockResolvedValue({
    data: { backups: overrides.backups ?? [mkBackup()], total: 1 },
  } as any);
  mockApi.getGatewayProvisioningRestoreStatus.mockResolvedValue({
    data: {
      active: overrides.active ?? null,
      history: overrides.history ?? [],
    },
  } as any);
}

describe('GatewayProvisioningTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders backup list after loading', async () => {
    render(<GatewayProvisioningTab gatewayId={GATEWAY_ID} wsConnected />);

    expect(await screen.findByText('mesh.zip')).toBeInTheDocument();
    expect(screen.getByText('Gateway push')).toBeInTheDocument();
  });

  it('subscribes to provisioning_restore_progress on mount', async () => {
    render(<GatewayProvisioningTab gatewayId={GATEWAY_ID} wsConnected />);
    await screen.findByText('mesh.zip');

    expect(mockSubscribe).toHaveBeenCalledWith('provisioning_restore_progress', expect.any(Function));
  });

  it('requests upload and refreshes list', async () => {
    mockApi.requestGatewayProvisioningUpload.mockResolvedValue({ data: { request_id: 'req-1' } } as any);

    render(<GatewayProvisioningTab gatewayId={GATEWAY_ID} wsConnected />);
    await screen.findByText('mesh.zip');

    fireEvent.click(screen.getByRole('button', { name: /request backup from gateway/i }));

    await waitFor(() => {
      expect(mockApi.requestGatewayProvisioningUpload).toHaveBeenCalledWith(GATEWAY_ID);
      expect(mockApi.listGatewayProvisioningBackups).toHaveBeenCalledTimes(2);
    });
  });

  it('shows active restore panel with backup filename label', async () => {
    setupDefaultMocks({
      active: {
        id: 'restore-1',
        backup_id: 'backup-1',
        gateway_id: GATEWAY_ID,
        facility_id: 'fac-1',
        status: 'transferring',
        chunks_total: 10,
        chunks_sent: 4,
        nonce: 'nonce-1',
        error_message: null,
        initiated_by: 'admin-1',
        started_at: '2026-01-02T00:00:00Z',
        completed_at: null,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    });

    render(<GatewayProvisioningTab gatewayId={GATEWAY_ID} wsConnected />);

    expect(await screen.findByText('Transferring')).toBeInTheDocument();
    expect(screen.getAllByText('mesh.zip').length).toBeGreaterThan(0);
    expect(screen.getByText(/Chunks 4\/10 \(40%\)/)).toBeInTheDocument();
  });
});
