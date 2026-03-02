import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DailyAccessCodesWidget } from '@/components/Widget/DailyAccessCodesWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';

const mockGetAppAccessCodes = jest.fn();
const mockGetFacilities = jest.fn();
const mockAddToast = jest.fn();

const mockUseAuth = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAppAccessCodes: (...args: unknown[]) => mockGetAppAccessCodes(...args),
    getFacilities: (...args: unknown[]) => mockGetFacilities(...args),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: () => mockUseGlobalFacility(),
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
}));

jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: mockAddToast }),
}));

describe('DailyAccessCodesWidget', () => {
  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <ThemeProvider>
        <DropdownProvider>{ui}</DropdownProvider>
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          id: 'user-1',
          role: 'tenant',
        },
      },
    });

    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'facility-1',
      selectedFacility: { id: 'facility-1', name: 'Facility One' },
      isAllFacilitiesSelected: false,
    });

    mockGetAppAccessCodes.mockResolvedValue({
      data: [
        {
          device_id: 'device-1',
          device_name: 'Gate A',
          device_type: 'gate',
          location_description: 'North entrance',
          code: '1234',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
        },
      ],
    });
  });

  it('loads and displays scoped access codes', async () => {
    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledWith('facility-1');
      expect(screen.getByText('Gate A')).toBeInTheDocument();
      expect(screen.getByText('1234')).toBeInTheDocument();
      expect(screen.getByText(/Always-on/)).toBeInTheDocument();
    });
  });

  it('supports admin all-facilities scope', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          id: 'user-2',
          role: 'admin',
        },
      },
    });
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      selectedFacility: null,
      isAllFacilitiesSelected: true,
    });
    mockGetFacilities.mockResolvedValue({
      facilities: [
        { id: 'facility-1', name: 'Facility One' },
        { id: 'facility-2', name: 'Facility Two' },
      ],
    });
    mockGetAppAccessCodes
      .mockResolvedValueOnce({
        data: [
          {
            device_id: 'device-1',
            device_name: 'Gate A',
            device_type: 'gate',
            code: '1111',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            device_id: 'device-2',
            device_name: 'Door B',
            device_type: 'door',
            code: '2222',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
          },
        ],
      });

    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(mockGetFacilities).toHaveBeenCalled();
      expect(mockGetAppAccessCodes).toHaveBeenCalledWith('facility-1');
      expect(mockGetAppAccessCodes).toHaveBeenCalledWith('facility-2');
      expect(screen.getByText('1111')).toBeInTheDocument();
      expect(screen.getByText('2222')).toBeInTheDocument();
    });
  });

  it('shows partial warning when one facility request fails', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          id: 'user-2',
          role: 'admin',
        },
      },
    });
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      selectedFacility: null,
      isAllFacilitiesSelected: true,
    });
    mockGetFacilities.mockResolvedValue({
      facilities: [
        { id: 'facility-1', name: 'Facility One' },
        { id: 'facility-2', name: 'Facility Two' },
      ],
    });
    mockGetAppAccessCodes
      .mockResolvedValueOnce({
        data: [
          {
            device_id: 'device-1',
            device_name: 'Gate A',
            device_type: 'gate',
            code: '1111',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
          },
        ],
      })
      .mockRejectedValueOnce(new Error('facility-2-failure'));

    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText('1111')).toBeInTheDocument();
      expect(screen.getByText(/Some facilities failed to load/i)).toBeInTheDocument();
      expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'warning',
      }));
    });
  });

  it('refresh button reloads data', async () => {
    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledTimes(1);
    });

    const refreshButton = await screen.findByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledTimes(2);
    });
  });

  it('shows error and can retry', async () => {
    mockGetAppAccessCodes.mockRejectedValueOnce(new Error('network'));
    mockGetAppAccessCodes.mockResolvedValueOnce({
      data: [],
    });

    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load access codes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledTimes(2);
    });
  });
});

