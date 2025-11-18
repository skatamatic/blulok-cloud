import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FacilityDetailsPage from '@/pages/FacilityDetailsPage';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');
jest.mock('@/components/GoogleMaps/MapCard', () => ({
  MapCard: () => <div data-testid="map-card" />,
}));
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

const mockApi = apiService as jest.Mocked<typeof apiService>;

const renderWithProviders = (ui: React.ReactElement, initialPath = '/facilities/fac-1') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, 'Test', initialPath);
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/facilities/:id" element={ui} />
          <Route path="/facilities" element={<div>Facilities List</div>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('FacilityDetailsPage - Delete flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getFacility.mockResolvedValue({
      facility: { id: 'fac-1', name: 'Test Facility', address: '123 St', stats: { totalUnits: 0, occupiedUnits: 0, devicesOnline: 0, devicesTotal: 0 } },
      deviceHierarchy: {},
    } as any);
    mockApi.getUnits.mockResolvedValue({ units: [] } as any);
    mockApi.getFacilityDeleteImpact.mockResolvedValue({ units: 2, devices: 3, gateways: 1 } as any);
    mockApi.deleteFacility.mockResolvedValue({ success: true } as any);
  });

  it('shows Delete button for admin, loads impact, and deletes on confirm', async () => {
    renderWithProviders(<FacilityDetailsPage />);

    await waitFor(() => expect(screen.getByText('Test Facility')).toBeInTheDocument());

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);

    await waitFor(() => expect(mockApi.getFacilityDeleteImpact).toHaveBeenCalledWith('fac-1'));

    // Confirm modal content rendered
    await waitFor(() => expect(screen.getByText(/This will permanently delete this facility/i)).toBeInTheDocument());

    const confirm = screen.getByRole('button', { name: /delete facility/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(mockApi.deleteFacility).toHaveBeenCalledWith('fac-1'));

    // Navigates to facilities list
    await waitFor(() => expect(screen.getByText('Facilities List')).toBeInTheDocument());
  });
});

describe('FacilityDetailsPage - Devices and Units tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getFacility.mockResolvedValue({
      facility: {
        id: 'fac-1',
        name: 'Test Facility',
        address: '123 St',
        stats: { totalUnits: 10, occupiedUnits: 6, devicesOnline: 3, devicesTotal: 5 },
      },
      deviceHierarchy: { accessControlDevices: [], blulokDevices: [] },
    } as any);
    mockApi.getUnits.mockResolvedValue({ units: [], total: 0 } as any);
    mockApi.getDevices.mockResolvedValue({ devices: [], total: 0 } as any);
  });

  it('loads paginated devices when Devices tab is opened', async () => {
    mockApi.getDevices.mockResolvedValue({
      devices: [
        {
          id: 'device-1',
          device_category: 'blulok',
          facility_id: 'fac-1',
          unit_id: 'unit-1',
          unit_number: '101',
          device_serial: 'ABC123',
          lock_status: 'locked',
          device_status: 'online',
        },
      ],
      total: 1,
    } as any);

    renderWithProviders(<FacilityDetailsPage />);

    await waitFor(() => expect(screen.getByText('Test Facility')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Devices'));

    await waitFor(() => {
      expect(mockApi.getDevices).toHaveBeenCalledWith(expect.objectContaining({
        facility_id: 'fac-1',
        limit: 30,
        offset: 0,
      }));
      expect(screen.getByPlaceholderText('Search devices...')).toBeInTheDocument();
    });

    expect(await screen.findByText(/Showing 1 of 1 devices/i)).toBeInTheDocument();
  });

  it('loads paginated units when Units tab is opened', async () => {
    const pagedUnits = [{
      id: 'unit-1',
      facility_id: 'fac-1',
      unit_number: '101',
      unit_type: 'Large',
      status: 'available',
    }];

    mockApi.getUnits
      .mockResolvedValueOnce({ units: [], total: 0 } as any) // initial facility load
      .mockResolvedValue({ units: pagedUnits, total: 4 } as any);

    renderWithProviders(<FacilityDetailsPage />);

    await waitFor(() => expect(screen.getByText('Test Facility')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Units'));

    await waitFor(() => {
      expect(mockApi.getUnits).toHaveBeenCalledWith(expect.objectContaining({
        facility_id: 'fac-1',
        limit: 20,
        offset: 0,
      }));
      expect(screen.getByPlaceholderText('Search units...')).toBeInTheDocument();
    });

    expect(await screen.findByText(/Showing 1 of 4 units/i)).toBeInTheDocument();
  });
});


