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
      expect(screen.getByText('BluLok Device Details')).toBeInTheDocument();
    });
  }

  it('renders serial number input on configure step', async () => {
    await openBlulokConfigureStep();
    const serialInput = screen.getByPlaceholderText('e.g. BL-2024-001234');
    expect(serialInput).toBeInTheDocument();
    expect(serialInput).toHaveAttribute('required');
  });

  it('blocks submission when serial is missing/blank', async () => {
    await openBlulokConfigureStep();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unit-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. BL-2024-001234'), { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Device serial number is required')).toBeInTheDocument();
    });
    expect(mockApiService.createBluLokDevice).not.toHaveBeenCalled();
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
