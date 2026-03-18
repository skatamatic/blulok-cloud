import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('AddDeviceModal - BluLok serial requirements', () => {
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

  it('renders serial number input for manual BluLok add', async () => {
    render(
      <AddDeviceModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        deviceType="blulok"
      />
    );

    expect(await screen.findByText('BluLok Device Details')).toBeInTheDocument();
    const serialInput = screen.getByPlaceholderText('e.g. BL-2024-001234');
    expect(serialInput).toBeInTheDocument();
    expect(serialInput).toHaveAttribute('required');
  });

  it('blocks submission when serial is missing/blank', async () => {
    render(
      <AddDeviceModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        deviceType="blulok"
      />
    );

    await screen.findByText('BluLok Device Details');

    // Select facility to resolve gateway and load units
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'fac-1' } });

    await waitFor(() => {
      const updatedSelects = screen.getAllByRole('combobox');
      expect(updatedSelects[1]).toBeInTheDocument();
    });

    const refreshedSelects = screen.getAllByRole('combobox');
    fireEvent.change(refreshedSelects[1], { target: { value: 'unit-1' } });

    const serialInput = screen.getByPlaceholderText('e.g. BL-2024-001234');
    fireEvent.change(serialInput, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create BluLok Device' }));

    expect(await screen.findByText('Device serial number is required')).toBeInTheDocument();
    expect(mockApiService.createBluLokDevice).not.toHaveBeenCalled();
  });
});

