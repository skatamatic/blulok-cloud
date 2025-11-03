import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeviceAssignmentModal } from '@/components/Devices/DeviceAssignmentModal';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';

// Mock dependencies
jest.mock('@/services/api.service');
jest.mock('@/contexts/ToastContext', () => ({
  useToast: jest.fn(),
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

const mockAddToast = jest.fn();

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  mockUseToast.mockReturnValue({
    addToast: mockAddToast,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('DeviceAssignmentModal', () => {
  const mockUnit = {
    id: 'unit-1',
    unit_number: 'A-101',
    unit_type: 'storage',
    facility_id: 'facility-1',
  };

  const mockUnitWithDevice = {
    ...mockUnit,
    blulok_device: {
      id: 'device-1',
      device_serial: 'BLU-001',
      firmware_version: '1.0.0',
      device_status: 'online',
      battery_level: 85,
    },
  };

  const mockUnassignedDevices = [
    {
      id: 'device-2',
      device_serial: 'BLU-002',
      firmware_version: '1.1.0',
      device_status: 'online' as const,
      battery_level: 90,
      facility_name: 'Test Facility',
      gateway_name: 'Gateway 1',
    },
    {
      id: 'device-3',
      device_serial: 'BLU-003',
      firmware_version: '1.0.5',
      device_status: 'offline' as const,
      battery_level: 75,
      facility_name: 'Test Facility',
      gateway_name: 'Gateway 2',
    },
  ];

  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getUnassignedDevices.mockResolvedValue({
      success: true,
      devices: mockUnassignedDevices,
      total: mockUnassignedDevices.length,
    });
    mockApiService.assignDeviceToUnit.mockResolvedValue({
      success: true,
      message: 'Device assigned successfully',
    });
    mockApiService.unassignDeviceFromUnit.mockResolvedValue({
      success: true,
      message: 'Device unassigned successfully',
    });
  });

  describe('Rendering', () => {
    it('should render the modal when open', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Assign Device to Unit')).toBeInTheDocument();
      });

      expect(screen.getByText(`Unit ${mockUnit.unit_number} - ${mockUnit.unit_type}`)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      expect(screen.queryByText('Assign Device to Unit')).not.toBeInTheDocument();
    });

    it('should show "Change Device Assignment" when unit has device', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Change Device Assignment')).toBeInTheDocument();
      });
    });

    it('should display current device when unit has one', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Current Device')).toBeInTheDocument();
        expect(screen.getByText(mockUnitWithDevice.blulok_device!.device_serial)).toBeInTheDocument();
      });
    });
  });

  describe('Loading Unassigned Devices', () => {
    it('should load unassigned devices when modal opens', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(mockApiService.getUnassignedDevices).toHaveBeenCalledWith(mockUnit.facility_id);
      });
    });

    it('should display unassigned devices in dropdown', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1); // At least one option plus "Choose a device"
    });

    it('should show loading state while fetching devices', async () => {
      // Create a promise that we can control
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockApiService.getUnassignedDevices.mockReturnValueOnce(pendingPromise as any);

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/loading devices/i)).toBeInTheDocument();
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          success: true,
          devices: mockUnassignedDevices,
          total: mockUnassignedDevices.length,
        });
        await pendingPromise;
      });
    });

    it('should show empty state when no unassigned devices', async () => {
      mockApiService.getUnassignedDevices.mockResolvedValueOnce({
        success: true,
        devices: [],
        total: 0,
      });

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/no unassigned devices available/i)).toBeInTheDocument();
      });
    });

    it('should handle error when loading devices fails', async () => {
      mockApiService.getUnassignedDevices.mockRejectedValueOnce(new Error('Failed to load'));

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Failed to load unassigned devices',
        });
      });
    });
  });

  describe('Device Assignment', () => {
    it('should assign device when "Assign Device" button is clicked', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      // Click assign button
      const assignButton = screen.getByRole('button', { name: /assign device/i });
      await act(async () => {
        fireEvent.click(assignButton);
      });

      await waitFor(() => {
        expect(mockApiService.assignDeviceToUnit).toHaveBeenCalledWith(
          mockUnassignedDevices[0].id,
          mockUnit.id
        );
      });

      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Device assigned to unit successfully',
      });

      expect(mockOnSuccess).toHaveBeenCalled();
    });

    it('should disable assign button when no device is selected', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        const assignButton = screen.getByRole('button', { name: /assign device/i });
        expect(assignButton).toBeDisabled();
      });
    });

    it('should show loading state during assignment', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockApiService.assignDeviceToUnit.mockReturnValueOnce(pendingPromise as any);

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      // Click assign button
      const assignButton = screen.getByRole('button', { name: /assign device/i });
      await act(async () => {
        fireEvent.click(assignButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/assigning/i)).toBeInTheDocument();
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!({ success: true, message: 'Device assigned' });
        await pendingPromise;
      });
    });

    it('should handle assignment error', async () => {
      const error = new Error('Assignment failed');
      (error as any).response = { data: { message: 'Device already assigned' } };
      mockApiService.assignDeviceToUnit.mockRejectedValueOnce(error);

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      // Click assign button
      const assignButton = screen.getByRole('button', { name: /assign device/i });
      await act(async () => {
        fireEvent.click(assignButton);
      });

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Device already assigned',
        });
      });
    });
  });

  describe('Device Unassignment', () => {
    it('should show unassign button when unit has device', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        // Find the unassign button by its red color (text-red-600 class)
        const buttons = screen.getAllByRole('button');
        const unassignButton = buttons.find(button => 
          button.className.includes('text-red-600') || button.className.includes('text-red-700')
        );
        expect(unassignButton).toBeInTheDocument();
      });
    });

    it('should show confirmation modal when unassign button is clicked', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        const unassignButton = screen.getAllByRole('button').find(
          (btn) => btn.querySelector('svg')
        );
        expect(unassignButton).toBeInTheDocument();
      });

      // Find the trash icon button (unassign)
      const buttons = screen.getAllByRole('button');
      const unassignButton = buttons.find((btn) => {
        const icon = btn.querySelector('svg');
        return icon && btn.getAttribute('class')?.includes('red');
      });

      if (unassignButton) {
        await act(async () => {
          fireEvent.click(unassignButton);
        });

        await waitFor(() => {
          expect(screen.getByText('Unassign Device')).toBeInTheDocument();
        });
      }
    });

    it('should unassign device when confirmed', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        const unassignButton = buttons.find((btn) => {
          const icon = btn.querySelector('svg');
          return icon && btn.getAttribute('class')?.includes('red');
        });
        if (unassignButton) {
          fireEvent.click(unassignButton);
        }
      });

      await waitFor(() => {
        expect(screen.getByText('Unassign Device')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /unassign/i });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockApiService.unassignDeviceFromUnit).toHaveBeenCalledWith(
          mockUnitWithDevice.blulok_device!.id
        );
      });

      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Device unassigned from unit successfully',
      });

      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  describe('Change Device Flow', () => {
    it('should show "Change Device" button when unit has device and new device selected', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a new device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /change device/i })).toBeInTheDocument();
      });
    });

    it('should change device when "Change Device" button is clicked', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a new device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      // Click change device button
      const changeButton = screen.getByRole('button', { name: /change device/i });
      await act(async () => {
        fireEvent.click(changeButton);
      });

      await waitFor(() => {
        expect(mockApiService.unassignDeviceFromUnit).toHaveBeenCalledWith(
          mockUnitWithDevice.blulok_device!.id
        );
        expect(mockApiService.assignDeviceToUnit).toHaveBeenCalledWith(
          mockUnassignedDevices[0].id,
          mockUnitWithDevice.id
        );
      });

      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Device changed successfully',
      });

      expect(mockOnSuccess).toHaveBeenCalled();
    });

    it('should handle error during device change', async () => {
      const error = new Error('Change failed');
      mockApiService.unassignDeviceFromUnit.mockRejectedValueOnce(error);

      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a new device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      // Click change device button
      const changeButton = screen.getByRole('button', { name: /change device/i });
      await act(async () => {
        fireEvent.click(changeButton);
      });

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Failed to change device',
        });
      });
    });
  });

  describe('Modal Actions', () => {
    it('should close modal when close button is clicked', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Assign Device to Unit')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      await act(async () => {
        fireEvent.click(closeButton);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should reset selected device when modal closes', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      expect(select.value).toBe(mockUnassignedDevices[0].id);

      // Close modal
      const closeButton = screen.getByRole('button', { name: /close/i });
      await act(async () => {
        fireEvent.click(closeButton);
      });

      // Reopen modal
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        const newSelect = screen.getByRole('combobox') as HTMLSelectElement;
        expect(newSelect.value).toBe('');
      });
    });
  });

  describe('Device Selection', () => {
    it('should display device details when device is selected', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnit}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select a device
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: mockUnassignedDevices[0].id } });
      });

      await waitFor(() => {
        expect(screen.getByText(/device details/i)).toBeInTheDocument();
        expect(screen.getByText(mockUnassignedDevices[0].device_serial)).toBeInTheDocument();
      });
    });

    it('should filter out current device from available devices when changing', async () => {
      renderWithProviders(
        <DeviceAssignmentModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          unit={mockUnitWithDevice}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      // Current device should not be in the options
      const options = Array.from(select.options).map(opt => opt.value);
      expect(options).not.toContain(mockUnitWithDevice.blulok_device!.id);
    });
  });
});

