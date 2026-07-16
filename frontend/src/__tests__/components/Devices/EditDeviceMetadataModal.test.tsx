import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { EditDeviceMetadataModal } from '@/components/Devices/EditDeviceMetadataModal';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    updateAccessControlDeviceMetadata: jest.fn(),
    updateBluLokDeviceMetadata: jest.fn(),
  },
}));

describe('EditDeviceMetadataModal', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows gateway sync warning for provisioned devices', () => {
    render(
      <EditDeviceMetadataModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        device={{
          id: 'ac-1',
          category: 'access_control',
          device_serial: 'KP-1',
          relay_channel: 1,
          name: 'Main Gate',
          metadata: { createdFromGatewaySync: true },
        }}
      />
    );

    expect(screen.getByText(/gateway inventory/i)).toBeInTheDocument();
  });

  it('submits access control metadata update', async () => {
    (apiService.updateAccessControlDeviceMetadata as jest.Mock).mockResolvedValue({
      success: true,
      sideEffects: { identityChanged: false, accessCodesPushed: false },
    });

    render(
      <EditDeviceMetadataModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        device={{
          id: 'ac-1',
          category: 'access_control',
          device_serial: 'KP-1',
          relay_channel: 1,
          name: 'Main Gate',
          location_description: 'Front',
          access_methods: ['app'],
        }}
      />
    );

    await userEvent.clear(screen.getByLabelText(/^Location/i));
    await userEvent.type(screen.getByLabelText(/^Location/i), 'Updated location');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiService.updateAccessControlDeviceMetadata).toHaveBeenCalledWith(
        'ac-1',
        expect.objectContaining({ location_description: 'Updated location' })
      );
    });
  });

  it('configures relay-only no-feedback behavior', async () => {
    (apiService.updateAccessControlDeviceMetadata as jest.Mock).mockResolvedValue({
      success: true,
      sideEffects: { identityChanged: false, accessCodesPushed: false },
    });

    render(
      <EditDeviceMetadataModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        device={{
          id: 'ac-1',
          category: 'access_control',
          device_serial: 'KP-1',
          relay_channel: 1,
          name: 'Main Gate',
          location_description: 'Front',
          access_methods: ['app'],
          has_lock_feedback: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /hardware reports open\/closed state/i }));
    const timeout = screen.getByRole('spinbutton', { name: /assume open for/i });
    fireEvent.change(timeout, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiService.updateAccessControlDeviceMetadata).toHaveBeenCalledWith(
        'ac-1',
        expect.objectContaining({
          has_lock_feedback: false,
          no_feedback_open_timeout_sec: 25,
        }),
      );
    });
  });

  it('maps 409 conflict to relay_channel field', async () => {
    const axiosError = new axios.AxiosError('Conflict');
    axiosError.response = {
      status: 409,
      data: { message: 'Device serial "KP-1" on relay 2 is already in use' },
    } as never;
    (apiService.updateAccessControlDeviceMetadata as jest.Mock).mockRejectedValue(axiosError);

    render(
      <EditDeviceMetadataModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        device={{
          id: 'ac-1',
          category: 'access_control',
          device_serial: 'KP-1',
          relay_channel: 1,
          name: 'Main Gate',
          location_description: 'Front',
          access_methods: ['app'],
        }}
      />
    );

    const relaySelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(relaySelect, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Confirm identity change/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /save identity change/i }));

    await waitFor(() => {
      expect(screen.getByText(/Device serial "KP-1" on relay 2 is already in use/i)).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows gateway sync-managed guidance including lock number overwrite', () => {
    render(
      <EditDeviceMetadataModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        device={{
          id: 'lock-1',
          category: 'blulok',
          device_serial: 'HW-1',
          metadata: { createdFromGatewaySync: true },
        }}
      />,
    );

    expect(screen.getByText(/provisioned from gateway inventory/i)).toBeInTheDocument();
    expect(screen.getByText(/lock number and other settings may be overwritten/i)).toBeInTheDocument();
  });
});
