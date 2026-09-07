import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import UnitDetailsPage from '@/pages/UnitDetailsPage';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');
jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-id'),
    unsubscribe: jest.fn(),
  }),
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: {
      user: { id: 'admin-1', role: 'admin', email: 'a@b.c', facilities: [] },
      isAuthenticated: true,
      isLoading: false,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: jest.fn() }),
}));
jest.mock('@/contexts/GlobalFacilityContext', () => ({
  GlobalFacilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobalFacility: () => ({
    facilities: [],
    selectedFacilityId: null,
    selectedFacility: null,
    setSelectedFacilityId: jest.fn(),
    isLoading: false,
    hasMultipleFacilities: false,
    isAllFacilitiesSelected: false,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/hooks/useRemoteUnlockAction', () => ({
  useRemoteUnlockAction: () => ({
    requestUnlock: jest.fn(),
    isSubmitting: jest.fn().mockReturnValue(false),
    syncLockStatus: jest.fn(),
  }),
}));
jest.mock('@/hooks/useLockDeviceRealtime', () => ({
  useLockDeviceRealtime: jest.fn(),
}));
jest.mock('@/utils/access-groups-load.utils', () => ({
  loadAccessGroupRefsForBlulokLock: jest.fn().mockResolvedValue([]),
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const unitFixture = {
  id: 'unit-1',
  unit_number: 'A-101',
  unit_type: 'standard',
  status: 'occupied',
  facility_id: 'fac-1',
  facility_name: 'Test Facility',
  facility_address: '123 St',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  primary_tenant: {
    id: 'tenant-1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
  },
};

const renderPage = () => {
  window.history.pushState({}, 'Test', '/units/unit-1');
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/units/:unitId" element={<UnitDetailsPage />} />
        <Route path="/units" element={<div>Units list</div>} />
      </Routes>
    </BrowserRouter>,
  );
};

describe('UnitDetailsPage - Delete flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getUnitDetails.mockResolvedValue({ success: true, unit: unitFixture } as any);
    mockApi.deleteUnit.mockResolvedValue({ success: true } as any);
  });

  it('shows delete button for admins and opens confirmation dialog', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete unit/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete unit/i }));

    expect(screen.getByText(/delete unit\?/i)).toBeInTheDocument();
    expect(screen.getByText(/route passes will be revoked/i)).toBeInTheDocument();
  });

  it('calls deleteUnit and navigates away on confirm', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete unit/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete unit/i }));
    const confirmButtons = screen.getAllByRole('button', { name: /^delete unit$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockApi.deleteUnit).toHaveBeenCalledWith('unit-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Units list')).toBeInTheDocument();
    });
  });

  it('keeps confirmation open when delete fails', async () => {
    mockApi.deleteUnit.mockRejectedValueOnce({
      response: { data: { message: 'Gateway unavailable' } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete unit/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete unit/i }));
    const confirmButtons = screen.getAllByRole('button', { name: /^delete unit$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockApi.deleteUnit).toHaveBeenCalledWith('unit-1');
    });

    expect(screen.getByText(/delete unit\?/i)).toBeInTheDocument();
    expect(screen.queryByText('Units list')).not.toBeInTheDocument();
  });
});
