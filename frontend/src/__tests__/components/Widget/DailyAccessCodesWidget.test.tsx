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

  it('loads and displays scoped access codes grouped by type and device', async () => {
    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledWith('facility-1');
      expect(screen.getByText('Gates')).toBeInTheDocument();
      expect(screen.getByText('Gate A')).toBeInTheDocument();
      expect(screen.getByText('1234')).toBeInTheDocument();
      expect(screen.getByText(/Always-on/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Gateway relay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/North entrance/i)).not.toBeInTheDocument();
  });

  it('groups multiple schedules under one device without repeating device headers', async () => {
    mockGetAppAccessCodes.mockResolvedValue({
      data: [
        {
          device_id: 'device-1',
          device_name: 'Access Control 1',
          device_type: 'door',
          location_description: 'Gateway relay 1',
          code: '793740',
          schedule_id: 's1',
          schedule_name: 'Always-on',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
        },
        {
          device_id: 'device-1',
          device_name: 'Access Control 1',
          device_type: 'door',
          location_description: 'Gateway relay 1',
          code: '031754',
          schedule_id: 's2',
          schedule_name: 'Default Tenant Schedule',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
        },
        {
          device_id: 'device-1',
          device_name: 'Access Control 1',
          device_type: 'door',
          location_description: 'Gateway relay 1',
          code: '393781',
          schedule_id: 's3',
          schedule_name: 'Maintenance Schedule',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
        },
      ],
    });

    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText('Doors')).toBeInTheDocument();
      expect(screen.getAllByText('Access Control 1')).toHaveLength(1);
      expect(screen.getByText('793740')).toBeInTheDocument();
      expect(screen.getByText('031754')).toBeInTheDocument();
      expect(screen.getByText('393781')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Gateway relay/i)).not.toBeInTheDocument();
  });

  it('shows select-facility placeholder in all-facilities mode', async () => {
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

    renderWithProviders(<DailyAccessCodesWidget currentSize="medium" onSizeChange={() => undefined} />);

    expect(screen.getByText('Select a facility')).toBeInTheDocument();
    expect(screen.getByText(/Choose a facility from the header/i)).toBeInTheDocument();
    expect(mockGetAppAccessCodes).not.toHaveBeenCalled();
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

