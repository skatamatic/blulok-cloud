import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('AddDeviceModal - BluLok wizard', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getFacilities.mockResolvedValue({
      facilities: [{ id: 'fac-1', name: 'Facility One' }],
    } as any);
    mockApiService.getGateways.mockResolvedValue({
      gateways: [{ id: 'gw-1' }],
    } as any);
    mockApiService.getUnits.mockResolvedValue({
      units: [{ id: 'unit-1', unit_number: '101', unit_type: 'Standard' }],
    } as any);
    mockApiService.createBluLokDevice.mockResolvedValue({ success: true } as any);
  });

  async function openBlulokConfigureStep() {
    render(
      <AddDeviceModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        facilityId="fac-1"
        deviceType="blulok"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('BluLok lock details')).toBeInTheDocument();
    });
  }

  it('renders lock number input on configure step', async () => {
    await openBlulokConfigureStep();
    expect(screen.getByLabelText(/Lock number/i)).toBeInTheDocument();
  });

  it('renders hardware serial input on configure step', async () => {
    await openBlulokConfigureStep();
    expect(screen.getByLabelText(/Hardware serial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unit assignment/i)).toBeInTheDocument();
  });

  it('blocks submission when serial is missing/blank', async () => {
    await openBlulokConfigureStep();

    fireEvent.change(screen.getByLabelText(/Hardware serial/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Hardware serial is required')).toBeInTheDocument();
    });
    expect(mockApiService.createBluLokDevice).not.toHaveBeenCalled();
  });

  it('creates BluLok without unit assignment', async () => {
    await openBlulokConfigureStep();

    fireEvent.change(screen.getByLabelText(/Hardware serial/i), { target: { value: 'BL-TEST-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Review & create')).toBeInTheDocument();
    });

    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create device' }));

    await waitFor(() => {
      expect(mockApiService.createBluLokDevice).toHaveBeenCalledWith({
        gateway_id: 'gw-1',
        device_serial: 'BL-TEST-001',
      });
    });
  });

  it('shows gateway picker when multiple gateways exist', async () => {
    mockApiService.getGateways.mockResolvedValue({
      gateways: [
        { id: 'gw-1', name: 'Gateway A', facility_id: 'fac-1', status: 'online' },
        { id: 'gw-2', name: 'Gateway B', facility_id: 'fac-1', status: 'online' },
      ],
    } as any);

    await openBlulokConfigureStep();

    expect(screen.getByLabelText(/^Gateway/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Gateway A/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Gateway B/i })).toBeInTheDocument();
  });

  it('creates BluLok with optional unit and display name', async () => {
    await openBlulokConfigureStep();

    fireEvent.change(screen.getByLabelText(/Hardware serial/i), { target: { value: 'BL-TEST-002' } });
    fireEvent.change(screen.getByLabelText(/Display name/i), { target: { value: 'Front lock' } });
    fireEvent.change(screen.getByLabelText(/Unit assignment/i), { target: { value: 'unit-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Review & create')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create device' }));

    await waitFor(() => {
      expect(mockApiService.createBluLokDevice).toHaveBeenCalledWith({
        gateway_id: 'gw-1',
        device_serial: 'BL-TEST-002',
        unit_id: 'unit-1',
        name: 'Front lock',
        device_settings: { displayName: 'Front lock' },
      });
    });
  });

  it('submits lock number in device_settings on create', async () => {
    await openBlulokConfigureStep();

    fireEvent.change(screen.getByLabelText(/Hardware serial/i), { target: { value: 'BL-LOCK-NUM' } });
    fireEvent.change(screen.getByLabelText(/Lock number/i), { target: { value: '2453' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Review & create')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create device' }));

    await waitFor(() => {
      expect(mockApiService.createBluLokDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          device_serial: 'BL-LOCK-NUM',
          device_settings: expect.objectContaining({ lockNumber: 2453 }),
        }),
      );
    });
  });
});

describe('AddDeviceModal - Access control wizard', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getFacilities.mockResolvedValue({ facilities: [] } as any);
    mockApiService.getGateways.mockResolvedValue({ gateways: [{ id: 'gw-1' }] } as any);
    mockApiService.getUnits.mockResolvedValue({ units: [] } as any);
    mockApiService.createAccessControlDevice.mockResolvedValue({ success: true } as any);
  });

  it('submits access control with device_serial from configure step', async () => {
    render(
      <AddDeviceModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        facilityId="fac-1"
        deviceType="access_control"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Access control device details')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Main gate keypad'), { target: { value: 'Main Gate' } });
    fireEvent.change(screen.getByPlaceholderText('KP-7F2A-001'), { target: { value: 'KP-TEST-001' } });
    fireEvent.change(screen.getByPlaceholderText('North parking gate'), { target: { value: 'North entrance' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Review & create')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create device' }));

    await waitFor(() => {
      expect(mockApiService.createAccessControlDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway_id: 'gw-1',
          device_serial: 'KP-TEST-001',
          name: 'Main Gate',
          location_description: 'North entrance',
        })
      );
    });
  });
});
