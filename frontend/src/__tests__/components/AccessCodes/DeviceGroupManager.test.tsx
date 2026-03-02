import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeviceGroupManager } from '@/components/AccessCodes/DeviceGroupManager';

const mockAddToast = jest.fn();
const mockCreateDeviceGroup = jest.fn();
const mockGetDeviceGroup = jest.fn();
const mockAddDeviceGroupMember = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    createDeviceGroup: (...args: unknown[]) => mockCreateDeviceGroup(...args),
    getDeviceGroup: (...args: unknown[]) => mockGetDeviceGroup(...args),
    addDeviceGroupMember: (...args: unknown[]) => mockAddDeviceGroupMember(...args),
    removeDeviceGroupMember: jest.fn(),
    deleteDeviceGroup: jest.fn(),
  },
}));

describe('DeviceGroupManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceGroup.mockResolvedValue({ data: { members: [] } });
    mockAddDeviceGroupMember.mockResolvedValue({ success: true });
    mockCreateDeviceGroup.mockResolvedValue({ data: { id: 'created-group-1' } });
  });

  it('prevents creating duplicate group names', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'access_code',
              is_global_shared: false,
              name: 'Main Entrances',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.change(screen.getByPlaceholderText('New group name'), {
      target: { value: 'main entrances' },
    });

    const createButton = screen.getByRole('button', { name: /create/i });
    expect(createButton).toBeDisabled();

    expect(mockCreateDeviceGroup).not.toHaveBeenCalled();
    expect(screen.getByText(/Group name already exists in this facility/i)).toBeInTheDocument();
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('adds blulok members with explicit device type', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'lock-1', name: 'Unit 101 Lock', device_category: 'blulok', unit_id: 'unit-101', unit_number: '101', device_serial: 'BLU-101' },
          ]}
          groups={[
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'access_code',
              is_global_shared: false,
              name: 'Residential Zone',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...'), {
      target: { value: '101' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Unit 101 Lock/i }));
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockAddDeviceGroupMember).toHaveBeenCalledWith('group-1', {
        deviceId: 'lock-1',
        unitId: 'unit-101',
        deviceType: 'blulok',
      });
    });
  });

  it('shows API conflict message when add member fails exclusivity check', async () => {
    mockAddDeviceGroupMember.mockRejectedValueOnce({
      response: {
        data: {
          code: 'ACCESS_CODE_GROUP_MEMBERSHIP_CONFLICT',
          message: 'Access-control device is already assigned to access-code group "Front Gates"',
        },
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'ac-1', name: 'Gate A', device_category: 'access_control', device_type: 'gate', access_methods: ['keypad'] },
          ]}
          groups={[
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'access_code',
              name: 'Building A',
              is_global_shared: false,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...'), {
      target: { value: 'Gate A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gate A/i }));
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        title: expect.stringContaining('already assigned'),
      }));
    });
  });

  it('prevents creating groups with invalid characters', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.change(screen.getByPlaceholderText('New group name'), {
      target: { value: 'Main @ Entrances' },
    });

    expect(screen.getByRole('button', { name: /create group/i })).toBeDisabled();
    expect(screen.getByText(/Use letters, numbers, spaces, and basic punctuation/i)).toBeInTheDocument();
    expect(mockCreateDeviceGroup).not.toHaveBeenCalled();
  });

  it('trims whitespace before saving a new group', async () => {
    const onGroupsChanged = jest.fn(async () => undefined);
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[]}
          onGroupsChanged={onGroupsChanged}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.change(screen.getByPlaceholderText('New group name'), {
      target: { value: '  Group 42  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create group/i }));

    await waitFor(() => {
      expect(mockCreateDeviceGroup).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        group_type: 'zone',
        name: 'Group 42',
      });
    });
  });
});

