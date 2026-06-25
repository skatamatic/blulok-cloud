import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeviceGroupManager } from '@/components/AccessCodes/DeviceGroupManager';

const mockAddToast = jest.fn();
const mockCreateDeviceGroup = jest.fn();
const mockGetDeviceGroup = jest.fn();
const mockAddDeviceGroupMember = jest.fn();
const mockGetAccessCodeGroupConfig = jest.fn();
const mockUpdateAccessCodeGroupConfig = jest.fn();
const mockGetEffectiveAccessCodes = jest.fn();
const mockGetAccessCodePushState = jest.fn();
const mockGetFacilitySchedules = jest.fn();
const mockGetScheduleUsage = jest.fn();
const mockDeleteDeviceGroup = jest.fn();
const mockOnGroupChange = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    createDeviceGroup: (...args: unknown[]) => mockCreateDeviceGroup(...args),
    getDeviceGroup: (...args: unknown[]) => mockGetDeviceGroup(...args),
    addDeviceGroupMember: (...args: unknown[]) => mockAddDeviceGroupMember(...args),
    getAccessCodeGroupConfig: (...args: unknown[]) => mockGetAccessCodeGroupConfig(...args),
    updateAccessCodeGroupConfig: (...args: unknown[]) => mockUpdateAccessCodeGroupConfig(...args),
    getEffectiveAccessCodes: (...args: unknown[]) => mockGetEffectiveAccessCodes(...args),
    getAccessCodePushState: (...args: unknown[]) => mockGetAccessCodePushState(...args),
    getFacilitySchedules: (...args: unknown[]) => mockGetFacilitySchedules(...args),
    getScheduleUsage: (...args: unknown[]) => mockGetScheduleUsage(...args),
    removeDeviceGroupMember: jest.fn(),
    deleteDeviceGroup: (...args: unknown[]) => mockDeleteDeviceGroup(...args),
  },
}));

const defaultGroup = {
  id: 'group-default',
  facility_id: 'facility-1',
  group_type: 'access_code' as const,
  is_global_shared: true,
  is_default: true,
  name: 'Default Facility Group',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('DeviceGroupManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeviceGroup.mockResolvedValue({ data: { members: [] } });
    mockAddDeviceGroupMember.mockResolvedValue({ success: true });
    mockCreateDeviceGroup.mockResolvedValue({ data: { id: 'created-group-1' } });
    mockGetAccessCodeGroupConfig.mockResolvedValue({
      data: {
        is_enabled: true,
        digit_count: 6,
        rotation_interval_hours: 24,
        rotation_hour: 0,
        rotation_minute: 0,
      },
    });
    mockUpdateAccessCodeGroupConfig.mockResolvedValue({ success: true });
    mockGetEffectiveAccessCodes.mockResolvedValue({ data: [] });
    mockGetAccessCodePushState.mockResolvedValue({
      data: {
        facility_id: 'facility-1',
        status: 'active',
        last_error: null,
        last_nonce: null,
        updated_at: new Date().toISOString(),
      },
    });
    mockGetFacilitySchedules.mockResolvedValue({ schedules: [] });
    mockGetScheduleUsage.mockResolvedValue({ usage: { totalCount: 0 } });
    mockDeleteDeviceGroup.mockResolvedValue({ success: true });
    mockOnGroupChange.mockReset();
  });

  it('auto-selects and pins the default access group', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-default');
    });
    expect(screen.getByText(/Protected default/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete group/i })).not.toBeInTheDocument();
  });

  it('selects the requested group from initialGroupId', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-1');
    });
  });

  it('prevents creating duplicate group names', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'access_code',
              is_global_shared: false,
              is_default: false,
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
    fireEvent.change(screen.getByPlaceholderText('New access group name'), {
      target: { value: 'main entrances' },
    });

    const createButton = screen.getByRole('button', { name: /create access group/i });
    expect(createButton).toBeDisabled();

    expect(mockCreateDeviceGroup).not.toHaveBeenCalled();
    expect(screen.getByText(/An access group with that name already exists/i)).toBeInTheDocument();
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
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
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

    fireEvent.click(screen.getByRole('button', { name: /Residential Zone/i }));
    fireEvent.change(screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...'), {
      target: { value: '101' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Unit 101 Lock/i }));
    fireEvent.click(screen.getByRole('button', { name: /add device/i }));

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
          message: 'Access-control device is already assigned to access group "Front Gates"',
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
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              name: 'Building A',
              is_global_shared: false,
              is_default: false,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Building A/i }));
    fireEvent.change(screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...'), {
      target: { value: 'Gate A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gate A/i }));
    fireEvent.click(screen.getByRole('button', { name: /add device/i }));

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
          groups={[defaultGroup]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.change(screen.getByPlaceholderText('New access group name'), {
      target: { value: 'Main @ Entrances' },
    });

    expect(screen.getByRole('button', { name: /create access group/i })).toBeDisabled();
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
          groups={[defaultGroup]}
          onGroupsChanged={onGroupsChanged}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.change(screen.getByPlaceholderText('New access group name'), {
      target: { value: '  Group 42  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create access group/i }));

    await waitFor(() => {
      expect(mockCreateDeviceGroup).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        name: 'Group 42',
      });
    });
  });

  it('groups default members by type and hides remove actions', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: {
        members: [
          { device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-1' },
          { device_id: 'ac-1', device_type: 'access_control' },
        ],
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'lock-1', name: 'Unit 1', device_category: 'blulok', unit_id: 'unit-1', unit_number: '1', device_serial: '123' },
            { id: 'ac-1', name: 'Main Gate', device_category: 'access_control', device_type: 'gate', device_serial: 'GATE-1' },
          ]}
          groups={[defaultGroup]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Unit locks')).toBeInTheDocument();
      expect(screen.getByText('Access control')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Auto-assigned/i)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add device/i })).not.toBeInTheDocument();
  });

  it('shows remove actions for members in specific groups', async () => {
    mockGetDeviceGroup.mockImplementation(async (groupId: string) => {
      if (groupId === 'group-default') {
        return { data: { members: [] } };
      }
      return {
        data: {
          members: [{ device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-1' }],
        },
      };
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'lock-1', name: 'Unit 1', device_category: 'blulok', unit_id: 'unit-1', unit_number: '1' },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Building A/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Unit locks')).toBeInTheDocument();
  });

  it('creates a new group by copying members and access-code settings from an existing group', async () => {
    mockGetDeviceGroup.mockImplementation(async (groupId: string) => {
      if (groupId === 'group-source') {
        return {
          data: {
            members: [
              { device_id: 'ac-1', device_type: 'access_control' },
              { device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-101' },
            ],
          },
        };
      }
      return { data: { members: [] } };
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'lock-1', name: 'Unit 101 Lock', device_category: 'blulok', unit_id: 'unit-101', unit_number: '101' },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-source',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
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
    fireEvent.change(screen.getByPlaceholderText('Start blank...'), {
      target: { value: 'Building' },
    });
    const buildingOptions = screen.getAllByRole('button', { name: /Building A/i });
    fireEvent.click(buildingOptions[buildingOptions.length - 1]);
    fireEvent.change(screen.getByPlaceholderText('New access group name'), {
      target: { value: 'Building A Wing 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create copy/i }));

    await waitFor(() => {
      expect(mockCreateDeviceGroup).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        name: 'Building A Wing 2',
      });
      expect(mockGetAccessCodeGroupConfig).toHaveBeenCalledWith('group-source');
      expect(mockUpdateAccessCodeGroupConfig).toHaveBeenCalledWith('created-group-1', {
        is_enabled: true,
        digit_count: 6,
        rotation_interval_hours: 24,
        rotation_hour: 0,
        rotation_minute: 0,
      });
      expect(mockAddDeviceGroupMember).toHaveBeenCalledWith('created-group-1', {
        deviceId: 'ac-1',
        unitId: undefined,
        deviceType: 'access_control',
      });
      expect(mockAddDeviceGroupMember).toHaveBeenCalledWith('created-group-1', {
        deviceId: undefined,
        unitId: 'unit-101',
        deviceType: 'blulok',
      });
      expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'success',
        title: 'Access group created from copy',
      }));
    });
  });

  it('shows access codes sub-tab with shared group panel', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: {
        members: [{ device_id: 'ac-1', device_type: 'access_control' }],
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            { id: 'ac-1', name: 'Main Gate', device_category: 'access_control', device_type: 'gate', access_methods: ['keypad'] },
          ]}
          accessControlDevices={[
            {
              id: 'ac-1',
              gateway_id: 'gw-1',
              name: 'Main Gate',
              device_serial: 'GATE-1',
              device_type: 'gate',
              relay_channel: 1,
              status: 'online',
              is_locked: true,
              access_methods: ['app', 'keypad'],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Building A/i }));
    fireEvent.click(screen.getByRole('tab', { name: /access codes/i }));

    await waitFor(() => {
      expect(screen.getByText('Keypad device sync')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /re-generate group codes/i })).toBeInTheDocument();
    });
  });

  it('deletes a group without surfacing stale member-load errors', async () => {
    const customGroup = {
      id: 'group-1',
      facility_id: 'facility-1',
      group_type: 'zone' as const,
      is_global_shared: false,
      is_default: false,
      name: 'Building A',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockGetDeviceGroup.mockImplementation(async (groupId: string) => {
      if (groupId === 'group-1') {
        throw { response: { status: 404, data: { message: 'Not found' } } };
      }
      return { data: { members: [] } };
    });

    const onGroupsChanged = jest.fn(async () => undefined);

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[defaultGroup, customGroup]}
          onGroupsChanged={onGroupsChanged}
          initialGroupId="group-1"
          onGroupChange={mockOnGroupChange}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-1');
    });

    mockAddToast.mockClear();
    mockGetDeviceGroup.mockImplementation(async (groupId: string) => ({
      data: { members: [] },
    }));

    fireEvent.click(screen.getByRole('button', { name: /^Delete group$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete Group$/ }));

    await waitFor(() => {
      expect(mockDeleteDeviceGroup).toHaveBeenCalledWith('group-1');
      expect(mockOnGroupChange).toHaveBeenCalledWith('group-default');
    });

    expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Access group deleted' });
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Failed to load group members' }),
    );
  });

  it('shows lock page title for blulok members instead of device id', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: {
        members: [{ device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-101' }],
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            {
              id: 'lock-1',
              device_category: 'blulok',
              unit_id: 'unit-101',
              unit_number: '101',
              device_serial: '550e8400-e29b-41d4-a716-446655440011',
              device_settings: { lockNumber: 2453 },
            },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Lock #2453')).toBeInTheDocument();
    });
    expect(screen.queryByText('550e8400-e29b-41d4-a716-446655440011')).not.toBeInTheDocument();
  });

  it('shows display name from device settings in member list', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: {
        members: [{ device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-101' }],
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            {
              id: 'lock-1',
              device_category: 'blulok',
              unit_id: 'unit-101',
              unit_number: '101',
              device_settings: { displayName: 'North wing lock' },
            },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('North wing lock')).toBeInTheDocument();
    });
  });

  it('shows unknown lock when member device is missing from facility devices', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: {
        members: [{ device_id: 'missing-lock', device_type: 'blulok', source_unit_id: 'unit-999' }],
      },
    });

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Unknown lock')).toBeInTheDocument();
    });
    expect(screen.queryByText('missing-lock')).not.toBeInTheDocument();
  });

  it('follows initialGroupId when navigating to a different valid group', async () => {
    const customGroup = {
      id: 'group-1',
      facility_id: 'facility-1',
      group_type: 'zone' as const,
      is_global_shared: false,
      is_default: false,
      name: 'Building A',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { rerender } = render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[defaultGroup, customGroup]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-1');
    });

    mockGetDeviceGroup.mockClear();

    rerender(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[defaultGroup, customGroup]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-default"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-default');
    });
  });

  it('finds blulok devices in add-member search by lock number', async () => {
    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[
            {
              id: 'lock-1',
              device_category: 'blulok',
              unit_id: 'unit-101',
              unit_number: '101',
              device_settings: { lockNumber: 2453 },
            },
          ]}
          groups={[
            defaultGroup,
            {
              id: 'group-1',
              facility_id: 'facility-1',
              group_type: 'zone',
              is_global_shared: false,
              is_default: false,
              name: 'Building A',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by unit, device, serial, location, or ID...');
    fireEvent.change(searchInput, { target: { value: '2453' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lock #2453/i })).toBeInTheDocument();
    });
  });

  it('deletes the last non-default group without selecting a fallback group', async () => {
    const onlyGroup = {
      id: 'group-1',
      facility_id: 'facility-1',
      group_type: 'zone' as const,
      is_global_shared: false,
      is_default: false,
      name: 'Building A',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <MemoryRouter>
        <DeviceGroupManager
          facilityId="facility-1"
          devices={[]}
          groups={[onlyGroup]}
          onGroupsChanged={async () => undefined}
          initialGroupId="group-1"
          onGroupChange={mockOnGroupChange}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetDeviceGroup).toHaveBeenCalledWith('group-1');
    });

    fireEvent.click(screen.getByRole('button', { name: /^Delete group$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete Group$/ }));

    await waitFor(() => {
      expect(mockDeleteDeviceGroup).toHaveBeenCalledWith('group-1');
      expect(mockOnGroupChange).toHaveBeenCalledWith('');
    });
  });
});
