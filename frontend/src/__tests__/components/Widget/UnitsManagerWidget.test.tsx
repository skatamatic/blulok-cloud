/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UnitsManagerWidget } from '@/components/Widget/UnitsManagerWidget';
import { ToastProvider } from '@/contexts/ToastContext';
import { DropdownProvider } from '@/contexts/DropdownContext';

const mockGetUnits = jest.fn();
const mockGetUnitAccessHistory = jest.fn();
const mockUpdateLockStatus = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
    getUnitAccessHistory: (...args: unknown[]) => mockGetUnitAccessHistory(...args),
    updateLockStatus: (...args: unknown[]) => mockUpdateLockStatus(...args),
  },
}));

jest.mock('@/hooks/useLockDeviceRealtime', () => ({
  useLockDeviceRealtime: jest.fn(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: jest.fn(),
}));

const mockUseGlobalFacility = jest.requireMock('@/contexts/GlobalFacilityContext')
  .useGlobalFacility as jest.Mock;

const sampleUnits = {
  success: true,
  units: [
    {
      id: 'unit-1',
      unit_number: 'A-101',
      facility_id: 'fac-1',
      facility_name: 'Riverside',
      status: 'occupied',
      lock_status: 'locked',
      battery_level: 82,
      signal_strength: -52,
      last_activity: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      device_status: 'online',
      blulok_device: {
        id: 'dev-1',
        device_serial: 'BLU-A101',
        supports_remote_lock: true,
        lock_status: 'locked',
        device_status: 'online',
        battery_level: 82,
        signal_strength: -52,
      },
      primary_tenant: {
        id: 'tenant-1',
        first_name: 'Casey',
        last_name: 'Tenant',
        email: 'casey@example.com',
        phone_number: '+15551234567',
      },
      tenant_name: 'Casey Tenant',
      tenant_email: 'casey@example.com',
    },
    {
      id: 'unit-2',
      unit_number: 'B-204',
      facility_id: 'fac-1',
      facility_name: 'Riverside',
      status: 'occupied',
      lock_status: 'unlocked',
      battery_level: 18,
      signal_strength: -92,
      last_activity: new Date().toISOString(),
      device_status: 'online',
      blulok_device: {
        id: 'dev-2',
        supports_remote_lock: false,
        lock_status: 'unlocked',
      },
      tenant_name: null,
    },
    {
      id: 'unit-3',
      unit_number: 'C-301',
      facility_id: 'fac-1',
      facility_name: 'Riverside',
      status: 'available',
      lock_status: 'locked',
      last_activity: new Date().toISOString(),
      tenant_name: 'Vacant Unit',
    },
  ],
};

const renderWidget = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <DropdownProvider>
          <UnitsManagerWidget
            id="units-manager"
            title="Units Manager"
            currentSize="huge"
          />
        </DropdownProvider>
      </ToastProvider>
    </MemoryRouter>
  );

describe('UnitsManagerWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    mockUseGlobalFacility.mockReturnValue({
      isAllFacilitiesSelected: false,
      facilities: [{ id: 'fac-1', name: 'Riverside', lock_command_timeout_sec: 10 }],
    });
    mockGetUnits.mockResolvedValue(sampleUnits);
    mockGetUnitAccessHistory.mockResolvedValue({ logs: [] });
    mockUpdateLockStatus.mockResolvedValue({ success: true });
  });

  it('renders rows with unit, tenant, and lock badge', async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/Unit A-101/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Unit B-204/)).toBeInTheDocument();
    expect(screen.getByText(/Casey Tenant/)).toBeInTheDocument();
    expect(screen.getAllByTitle(/Locked|Unlocked/).length).toBeGreaterThan(0);
  });

  it('shows device details link in expanded panel only', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    expect(screen.queryByRole('button', { name: /^Details$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Unit A-101/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Unit details/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View tenant/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Device details/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /View tenant/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/users/tenant-1/details');
  });

  it('expands a row on click and shows unlock button', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    fireEvent.click(screen.getByRole('button', { name: /Unit A-101/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Unlock$/i })).toBeInTheDocument();
    });
    expect(mockGetUnitAccessHistory).toHaveBeenCalledWith('unit-1', { limit: 5 });
  });

  it('shows disabled unlock when unit has no device', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit C-301/));

    fireEvent.click(screen.getByRole('button', { name: /Unit C-301/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /No device/i })).toBeDisabled();
    });
  });

  it('disables unlock for already-unlocked units', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit B-204/));

    fireEvent.click(screen.getByRole('button', { name: /Unit B-204/ }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^Unlocked$/i });
      expect(btn).toBeDisabled();
    });
  });

  it('calls updateLockStatus when remote unlock pressed', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));
    fireEvent.click(screen.getByRole('button', { name: /Unit A-101/ }));

    const btn = await screen.findByRole('button', { name: /^Unlock$/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
    });
  });

  it('filters by device serial in search', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    fireEvent.change(screen.getByPlaceholderText(/Search units/), {
      target: { value: 'BLU-A101' },
    });

    await waitFor(() => {
      expect(screen.queryByText(/Unit B-204/)).not.toBeInTheDocument();
      expect(screen.getByText(/Unit A-101/)).toBeInTheDocument();
    });
  });

  it('filters by search', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    fireEvent.change(screen.getByPlaceholderText(/Search units/), {
      target: { value: 'B-204' },
    });

    await waitFor(() => {
      expect(screen.queryByText(/Unit A-101/)).not.toBeInTheDocument();
      expect(screen.getByText(/Unit B-204/)).toBeInTheDocument();
    });
  });

  it('filters unlocked units via toolbar toggle', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit B-204/));

    fireEvent.click(screen.getByRole('button', { name: /1 unlocked/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unit B-204/)).toBeInTheDocument();
      expect(screen.queryByText(/Unit A-101/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Unit C-301/)).not.toBeInTheDocument();
    });
  });

  it('filters low battery units and shows empty message when none match', async () => {
    mockGetUnits.mockResolvedValueOnce({
      success: true,
      units: [
        {
          ...sampleUnits.units[0],
          id: 'unit-healthy',
          unit_number: 'H-1',
          battery_level: 90,
          blulok_device: {
            ...sampleUnits.units[0].blulok_device,
            battery_level: 90,
            device_status: 'online',
          },
        },
      ],
    });

    renderWidget();
    await waitFor(() => screen.getByText(/Unit H-1/));

    fireEvent.click(screen.getByRole('button', { name: /0 low batt/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No units with low, critical, or unknown battery/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Show all units/i })).toBeInTheDocument();
    });
  });

  it('filters occupied units via toolbar toggle', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    fireEvent.click(screen.getByRole('button', { name: /2 occupied/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unit A-101/)).toBeInTheDocument();
      expect(screen.getByText(/Unit B-204/)).toBeInTheDocument();
      expect(screen.queryByText(/Unit C-301/)).not.toBeInTheDocument();
    });
  });

  it('filters unoccupied units via toolbar toggle', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit C-301/));

    fireEvent.click(screen.getByRole('button', { name: /1 unoccupied/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unit C-301/)).toBeInTheDocument();
      expect(screen.queryByText(/Unit A-101/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Unit B-204/)).not.toBeInTheDocument();
    });
  });

  it('sorts units naturally by unit name from the header', async () => {
    mockGetUnits.mockResolvedValueOnce({
      success: true,
      units: [
        { ...sampleUnits.units[0], id: 'unit-10', unit_number: '10' },
        { ...sampleUnits.units[0], id: 'unit-2', unit_number: '2' },
      ],
    });

    renderWidget();
    await waitFor(() => screen.getByText(/Unit 10/));

    const rows = screen.getAllByRole('button', { name: /Unit \d/ });
    expect(rows[0]).toHaveAccessibleName(/Unit 2/);
    expect(rows[1]).toHaveAccessibleName(/Unit 10/);
  });

  it('hides facility name in row subline when a single facility is scoped', async () => {
    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));
    expect(screen.queryByText(/Riverside/)).not.toBeInTheDocument();
  });

  it('shows facility filter and column in all-facilities mode', async () => {
    mockUseGlobalFacility.mockReturnValue({
      isAllFacilitiesSelected: true,
    });
    mockGetUnits.mockResolvedValue({
      success: true,
      units: [
        { ...sampleUnits.units[0], facility_id: 'fac-1', facility_name: 'Riverside' },
        {
          ...sampleUnits.units[1],
          id: 'unit-east',
          unit_number: 'D-10',
          facility_id: 'fac-2',
          facility_name: 'Eastside',
        },
      ],
    });

    renderWidget();
    await waitFor(() => screen.getByText(/Unit A-101/));

    expect(screen.getByLabelText(/Filter by facility/i)).toBeInTheDocument();
    expect(screen.getByText('Facility')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Riverside' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Eastside' })).toBeInTheDocument();
    expect(screen.getAllByText('Riverside').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Eastside').length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText(/Filter by facility/i), {
      target: { value: 'fac-2' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Unit D-10/)).toBeInTheDocument();
      expect(screen.queryByText(/Unit A-101/)).not.toBeInTheDocument();
    });
  });
});
