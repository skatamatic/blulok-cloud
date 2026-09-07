/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceFilter } from '@/components/Common/DeviceFilter';

const mockGetUnassignedDevices = jest.fn();
const mockGetDevices = jest.fn();
const mockGetBluLokDevice = jest.fn();
const mockGetAccessControlDevice = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnassignedDevices: (...args: unknown[]) => mockGetUnassignedDevices(...args),
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
    getBluLokDevice: (...args: unknown[]) => mockGetBluLokDevice(...args),
    getAccessControlDevice: (...args: unknown[]) => mockGetAccessControlDevice(...args),
  },
}));

const unassignedDevice = {
  id: 'dev-u1',
  device_serial: '123456789',
  unit_id: null,
  unit_number: null,
};

const facilityDevice = {
  id: 'dev-102',
  device_type: 'blulok',
  unit_number: '102',
  device_serial: '555551111',
  lock_status: 'locked',
};

describe('DeviceFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnassignedDevices.mockResolvedValue({ devices: [unassignedDevice] });
    mockGetDevices.mockResolvedValue({ devices: [facilityDevice], total: 1 });
    mockGetBluLokDevice.mockResolvedValue({ device: facilityDevice });
    mockGetAccessControlDevice.mockRejectedValue({ response: { status: 404 } });
  });

  it('loads unassigned devices for the facility (assignment picker)', async () => {
    const user = userEvent.setup();
    render(
      <DeviceFilter
        value=""
        onChange={jest.fn()}
        facilityId="fac-1"
        placeholder="Search devices..."
      />,
    );

    await waitFor(() => {
      expect(mockGetUnassignedDevices).toHaveBeenCalledWith('fac-1');
    });
    expect(mockGetDevices).not.toHaveBeenCalled();

    await user.click(screen.getByPlaceholderText('Search devices...'));
    expect(await screen.findByText(/Unassigned -/i)).toBeInTheDocument();
  });

  it('searches facility devices with facility_id and pagination', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <DeviceFilter
        value=""
        onChange={onChange}
        facilityId="fac-9"
        list="facility"
        placeholder="Search devices..."
        allowEmpty
      />,
    );

    await waitFor(() => {
      expect(mockGetDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'fac-9',
          limit: 20,
          offset: 0,
          device_scope: 'operational',
        }),
      );
    });
    expect(mockGetUnassignedDevices).not.toHaveBeenCalled();

    await user.click(screen.getByPlaceholderText('Search devices...'));
    expect(await screen.findByRole('button', { name: /all devices/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /102/ }));
    expect(onChange).toHaveBeenCalledWith('dev-102');
  });

  it('clears the selection via All devices', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <DeviceFilter
        value="dev-102"
        onChange={onChange}
        facilityId="fac-9"
        list="facility"
        allowEmpty
        emptyLabel="All devices"
        placeholder="Search devices..."
      />,
    );

    await user.click(screen.getByPlaceholderText('Search devices...'));
    fireEvent.click(await screen.findByRole('button', { name: 'All devices' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
