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


