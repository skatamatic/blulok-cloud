import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AccessCodeManagementTab } from '@/components/AccessCodes/AccessCodeManagementTab';
import { AccessControlDevice } from '@/types/facility.types';

const mockAddToast = jest.fn();
const mockGetAccessCodes = jest.fn();
const mockGetEffectiveAccessCodes = jest.fn();
const mockGetDeviceGroups = jest.fn();
const mockGetDeviceGroup = jest.fn();
const mockGetAccessCodeGroupConfig = jest.fn();
const mockUpdateAccessCodeGroupConfig = jest.fn();
const mockRotateAccessCodes = jest.fn();
const mockSetManualAccessCode = jest.fn();
const mockGetAccessCodePushState = jest.fn();
const mockGetFacilitySchedules = jest.fn();
const mockGetScheduleUsage = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAccessCodes: (...args: unknown[]) => mockGetAccessCodes(...args),
    getEffectiveAccessCodes: (...args: unknown[]) => mockGetEffectiveAccessCodes(...args),
    getDeviceGroups: (...args: unknown[]) => mockGetDeviceGroups(...args),
    getDeviceGroup: (...args: unknown[]) => mockGetDeviceGroup(...args),
    getAccessCodeGroupConfig: (...args: unknown[]) => mockGetAccessCodeGroupConfig(...args),
    updateAccessCodeGroupConfig: (...args: unknown[]) => mockUpdateAccessCodeGroupConfig(...args),
    rotateAccessCodes: (...args: unknown[]) => mockRotateAccessCodes(...args),
    setManualAccessCode: (...args: unknown[]) => mockSetManualAccessCode(...args),
    getAccessCodePushState: (...args: unknown[]) => mockGetAccessCodePushState(...args),
    getFacilitySchedules: (...args: unknown[]) => mockGetFacilitySchedules(...args),
    getScheduleUsage: (...args: unknown[]) => mockGetScheduleUsage(...args),
  },
}));

describe('AccessCodeManagementTab', () => {
  const selectGroupCard = async (groupName: string, waitForSetup = true) => {
    const card = await screen.findByRole('button', { name: new RegExp(`select ${groupName} access group`, 'i') });
    if (card.getAttribute('aria-pressed') !== 'true') {
      fireEvent.click(card);
    }
    if (waitForSetup) {
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('6 digits').length).toBeGreaterThan(0);
      });
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessCodes.mockResolvedValue({ data: [] });
    mockGetEffectiveAccessCodes.mockResolvedValue({ data: [] });
    mockGetDeviceGroups.mockResolvedValue({
      data: [{
        id: 'group-1',
        facility_id: 'facility-1',
        group_type: 'access_code',
        name: 'Main Entry Group',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });
    mockGetDeviceGroup.mockResolvedValue({
      data: { id: 'group-1', members: [{ device_id: 'ac-1', device_type: 'access_control' }] },
    });
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
    mockRotateAccessCodes.mockResolvedValue({ success: true });
    mockSetManualAccessCode.mockResolvedValue({ success: true });
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows setup warning and hides setup cards when selected group has no keypad-enabled members', async () => {
    mockGetDeviceGroup.mockResolvedValue({
      data: { id: 'group-1', members: [{ device_id: 'ac-1', device_type: 'access_control' }] },
    });
    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Door 1',
        device_serial: 'SN-ac-1',
        device_type: 'door',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app'], // No keypad support
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group', false);

    await waitFor(() => {
      expect(screen.getByText(
        /has no keypad-enabled access-control devices/i,
      )).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('6 digits')).not.toBeInTheDocument();
    });
  });

  it('renders effective code outcomes section', async () => {
    mockGetEffectiveAccessCodes.mockResolvedValue({
      data: [
        {
          device_id: 'ac-1',
          device_name: 'Main Gate',
          device_serial: 'SN-test',
        device_type: 'gate',
          location_description: 'Front entry',
          relay_channel: 1,
          code: '987654',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
          source_scope_type: 'device_group',
          source_scope_id: 'group-1',
          source_scope_name: 'Front Entry',
        },
      ],
    });
    mockGetDeviceGroups.mockResolvedValue({
      data: [{
        id: 'group-1',
        facility_id: 'facility-1',
        group_type: 'access_code',
        name: 'Front Entry',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Front Entry');
    await waitFor(() => {
      expect(screen.getByText('Keypad device sync')).toBeInTheDocument();
      expect(screen.getAllByText('Main Gate').length).toBeGreaterThan(0);
    });
  });

  it('submits manual group-scoped code set with expected payload', async () => {
    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');

    fireEvent.change(screen.getAllByPlaceholderText('6 digits')[0], { target: { value: '123456' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^set$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /set & push/i }));

    await waitFor(() => {
      expect(mockSetManualAccessCode).toHaveBeenCalledTimes(1);
      expect(mockSetManualAccessCode).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        scope_type: 'device_group',
        scope_id: 'group-1',
        code: '123456',
        schedule_id: null,
      });
    });
  });

  it('submits group-scoped regeneration with expected payload', async () => {
    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');

    fireEvent.click(screen.getByRole('button', { name: /re-generate group codes/i }));
    fireEvent.click(screen.getByRole('button', { name: /regenerate & push/i }));

    await waitFor(() => {
      expect(mockRotateAccessCodes).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        scope_type: 'device_group',
        scope_id: 'group-1',
      });
    });
  });

  it('includes backend error message when regeneration fails', async () => {
    mockRotateAccessCodes.mockRejectedValueOnce({
      response: {
        data: {
          message: 'gateway is offline; cannot push access codes',
        },
      },
    });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');

    fireEvent.click(screen.getByRole('button', { name: /re-generate group codes/i }));
    fireEvent.click(screen.getByRole('button', { name: /regenerate & push/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Failed to regenerate group code',
          message: 'gateway is offline; cannot push access codes',
        }),
      );
    });
  });

  it('prefers push-state last_error over generic internal server error on regeneration failure', async () => {
    mockRotateAccessCodes.mockRejectedValueOnce(new Error('Internal Server Error'));
    mockGetAccessCodePushState
      .mockResolvedValueOnce({
        data: {
          facility_id: 'facility-1',
          status: 'active',
          last_error: null,
          last_nonce: null,
          updated_at: new Date().toISOString(),
        },
      })
      .mockResolvedValueOnce({
        data: {
          facility_id: 'facility-1',
          status: 'error',
          last_error: 'gateway is offline; cannot push access codes',
          last_nonce: 'nonce-123',
          updated_at: new Date().toISOString(),
        },
      });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');

    fireEvent.click(screen.getByRole('button', { name: /re-generate group codes/i }));
    fireEvent.click(screen.getByRole('button', { name: /regenerate & push/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Failed to regenerate group code',
          message: 'gateway is offline; cannot push access codes',
        }),
      );
    });
  });

  it('refreshes schedule code rows after regeneration', async () => {
    mockGetFacilitySchedules.mockResolvedValue({
      schedules: [
        {
          id: 'sched-1',
          facility_id: 'facility-1',
          name: 'Daytime',
          schedule_type: 'custom',
          is_active: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          time_windows: [],
        },
      ],
    });
    mockGetScheduleUsage.mockResolvedValue({ usage: { totalCount: 4 } });
    mockGetAccessCodes
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'code-1',
            facility_id: 'facility-1',
            code: '112233',
            scope_type: 'device_group',
            scope_id: 'group-1',
            schedule_id: 'sched-1',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
            created_at: new Date().toISOString(),
            created_by: null,
            is_active: true,
          },
        ],
      });
    mockGetEffectiveAccessCodes
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            device_id: 'ac-1',
            device_name: 'Main Gate',
            device_serial: 'SN-test',
            device_type: 'gate',
            location_description: 'Front entry',
            relay_channel: 1,
            code: '112233',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
            source_scope_type: 'device_group',
            source_scope_id: 'group-1',
            source_scope_name: 'Main Entry Group',
            schedule_id: 'sched-1',
            schedule_name: 'Daytime',
          },
        ],
      })
      .mockResolvedValue({
        data: [
          {
            device_id: 'ac-1',
            device_name: 'Main Gate',
            device_serial: 'SN-test',
            device_type: 'gate',
            location_description: 'Front entry',
            relay_channel: 1,
            code: '112233',
            valid_until: new Date(Date.now() + 3600_000).toISOString(),
            source_scope_type: 'device_group',
            source_scope_id: 'group-1',
            source_scope_name: 'Main Entry Group',
            schedule_id: 'sched-1',
            schedule_name: 'Daytime',
          },
        ],
      });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');
    await waitFor(() => {
      expect(screen.getByText('Daytime')).toBeInTheDocument();
    });
    const scheduleSection = screen.getByText('Schedule codes').closest('section');
    expect(within(scheduleSection as HTMLElement).getByText('4')).toBeInTheDocument();
    expect(screen.queryAllByText('112233')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /re-generate group codes/i }));
    fireEvent.click(screen.getByRole('button', { name: /regenerate & push/i }));

    await waitFor(() => {
      expect(mockRotateAccessCodes).toHaveBeenCalledWith({
        facility_id: 'facility-1',
        scope_type: 'device_group',
        scope_id: 'group-1',
      });
      expect(mockGetEffectiveAccessCodes.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('112233').length).toBeGreaterThan(0);
    });
  });

  it('shows per-schedule rows with user count and current code', async () => {
    mockGetFacilitySchedules.mockResolvedValue({
      schedules: [
        {
          id: 'sched-1',
          facility_id: 'facility-1',
          name: 'Daytime',
          schedule_type: 'custom',
          is_active: true,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          time_windows: [],
        },
      ],
    });
    mockGetScheduleUsage.mockResolvedValue({ usage: { totalCount: 12 } });
    mockGetEffectiveAccessCodes.mockResolvedValue({
      data: [
        {
          device_id: 'ac-1',
          device_name: 'Main Gate',
          device_serial: 'SN-test',
        device_type: 'gate',
          location_description: 'Front entry',
          relay_channel: 1,
          code: '654321',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
          source_scope_type: 'device_group',
          source_scope_id: 'group-1',
          source_scope_name: 'Main Entry Group',
          schedule_id: 'sched-1',
          schedule_name: 'Daytime',
        },
      ],
    });
    mockGetDeviceGroups.mockResolvedValue({
      data: [{
        id: 'group-1',
        facility_id: 'facility-1',
        group_type: 'access_code',
        name: 'Main Entry Group',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });
    mockGetAccessCodes.mockResolvedValue({
      data: [
        {
          id: 'code-1',
          facility_id: 'facility-1',
          code: '654321',
          scope_type: 'device_group',
          scope_id: 'group-1',
          schedule_id: 'sched-1',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
          created_at: new Date().toISOString(),
          created_by: null,
          is_active: true,
        },
      ],
    });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');
    await waitFor(() => {
      expect(screen.getByText('Daytime')).toBeInTheDocument();
      expect(screen.getAllByText('654321').length).toBeGreaterThan(0);
    });
    const scheduleSection = screen.getByText('Schedule codes').closest('section');
    expect(within(scheduleSection as HTMLElement).getByText('12')).toBeInTheDocument();
  });

  it('renders selectable group cards and switches selection', async () => {
    mockGetDeviceGroups.mockResolvedValue({
      data: [
        {
          id: 'group-1',
          facility_id: 'facility-1',
          group_type: 'access_code',
          name: 'Main Entry Group',
          is_active: true,
          is_default: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'group-2',
          facility_id: 'facility-1',
          group_type: 'access_code',
          name: 'Back Gate Group',
          is_active: true,
          is_default: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
    mockGetDeviceGroup.mockImplementation(async (groupId: string) => ({
      data: { id: groupId, members: [{ device_id: 'ac-1', device_type: 'access_control' }] },
    }));

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select main entry group access group/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /select back gate group access group/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /select back gate group access group/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select back gate group access group/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Keypad device sync')).toBeInTheDocument();
    });
  });

  it('renders unknown push state badge for unexpected backend status', async () => {
    mockGetAccessCodePushState.mockResolvedValueOnce({
      data: {
        facility_id: 'facility-1',
        status: 'queued',
        last_error: null,
        last_nonce: null,
        updated_at: new Date().toISOString(),
      },
    });

    const devices: AccessControlDevice[] = [
      {
        id: 'ac-1',
        gateway_id: 'gw-1',
        name: 'Main Gate',
        device_serial: 'SN-test',
        device_type: 'gate',
        relay_channel: 1,
        status: 'online',
        is_locked: true,
        access_methods: ['app', 'keypad'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(<AccessCodeManagementTab facilityId="facility-1" devices={devices} />);

    await waitFor(() => {
      expect(screen.getByText('Access Codes')).toBeInTheDocument();
    });
    await selectGroupCard('Main Entry Group');
    await waitFor(() => {
      expect(screen.getByText(/Gateway push: unknown/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Push: unknown/i).length).toBeGreaterThan(0);
    });
  });
});

