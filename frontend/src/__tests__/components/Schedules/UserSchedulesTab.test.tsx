/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { UserSchedulesTab } from '@/components/Schedules/UserSchedulesTab';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/api.service');
jest.mock('@/contexts/AuthContext');
jest.mock('@/contexts/ToastContext');

describe('UserSchedulesTab', () => {
  const facilityId = 'fac-1';
  const addToast = jest.fn();

  const tenantUser = {
    id: 'tenant-1',
    email: 'tenant@example.com',
    firstName: 'Alex',
    lastName: 'Tenant',
    role: UserRole.TENANT,
  };

  const maintenanceUser = {
    id: 'maint-1',
    email: 'maint@example.com',
    firstName: 'Morgan',
    lastName: 'Tech',
    role: UserRole.MAINTENANCE,
  };

  const schedules = [
    {
      id: 'sched-custom',
      name: 'Weekday Access',
      facility_id: facilityId,
      schedule_type: 'custom',
      is_active: true,
      time_windows: [],
    },
    {
      id: 'sched-default-tenant',
      name: 'Default Tenant Schedule',
      facility_id: facilityId,
      schedule_type: 'precanned',
      is_active: true,
      time_windows: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ addToast });
    (useAuth as jest.Mock).mockReturnValue({
      authState: { user: { id: 'admin-1', role: 'admin' } },
    });

    (apiService.getUsers as jest.Mock).mockResolvedValue({
      users: [
        tenantUser,
        maintenanceUser,
        {
          id: 'admin-2',
          role: UserRole.ADMIN,
          email: 'a@x.com',
          firstName: 'A',
          lastName: 'D',
        },
      ],
      total: 3,
    });
    (apiService.getFacilitySchedules as jest.Mock).mockResolvedValue({ schedules });
    (apiService.getFacilityUserScheduleAssignments as jest.Mock).mockResolvedValue({
      assignments: [{ userId: 'tenant-1', scheduleId: 'sched-custom' }],
    });
    (apiService.getUnits as jest.Mock).mockResolvedValue({
      units: [
        {
          id: 'unit-1',
          unit_number: 'A-101',
          primary_tenant: { id: 'tenant-1' },
          shared_tenants: [
            {
              id: 'co-1',
              email: 'cotenant@example.com',
              first_name: 'Casey',
              last_name: 'Share',
              role: UserRole.TENANT,
            },
          ],
        },
      ],
      total: 1,
    });
    (apiService.setUserScheduleForFacility as jest.Mock).mockResolvedValue({ success: true });
  });

  it('denies tenants without calling schedule APIs', () => {
    (useAuth as jest.Mock).mockReturnValue({
      authState: { user: { id: 't1', role: 'tenant' } },
    });

    render(<UserSchedulesTab facilityId={facilityId} />);

    expect(
      screen.getByText(/You do not have permission to manage user schedules/i),
    ).toBeInTheDocument();
    expect(apiService.getUsers).not.toHaveBeenCalled();
  });

  it('loads every facility tenant including unit co-tenants and uses the bulk assignment API', async () => {
    render(<UserSchedulesTab facilityId={facilityId} />);

    await waitFor(() => {
      expect(screen.getByText('Alex Tenant')).toBeInTheDocument();
      expect(screen.getByText('Morgan Tech')).toBeInTheDocument();
      expect(screen.getByText('Casey Share')).toBeInTheDocument();
    });

    expect(screen.getByRole('columnheader', { name: /User/i })).toBeInTheDocument();
    expect(screen.getAllByText('A-101')).toHaveLength(2);
    expect(screen.getByText('Weekday Access')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(apiService.getUsers).toHaveBeenCalledWith({
      facility: facilityId,
      limit: 200,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(apiService.getFacilityUserScheduleAssignments).toHaveBeenCalledWith(facilityId);
    expect(apiService.getUserScheduleForFacility).not.toHaveBeenCalled();
    expect(screen.queryByText('A D')).not.toBeInTheDocument();
  });

  it('pages past the default 20-user API cap', async () => {
    const pageOne = Array.from({ length: 200 }, (_, i) => ({
      id: `tenant-${i}`,
      email: `t${i}@x.com`,
      firstName: 'Page',
      lastName: `${i}`,
      role: UserRole.TENANT,
    }));
    (apiService.getUsers as jest.Mock)
      .mockResolvedValueOnce({ users: pageOne, total: 201 })
      .mockResolvedValueOnce({
        users: [
          {
            id: 'tenant-200',
            email: 'last@x.com',
            firstName: 'Last',
            lastName: 'User',
            role: UserRole.TENANT,
          },
        ],
        total: 201,
      });
    (apiService.getUnits as jest.Mock).mockResolvedValue({ units: [], total: 0 });
    (apiService.getFacilityUserScheduleAssignments as jest.Mock).mockResolvedValue({
      assignments: [],
    });

    render(<UserSchedulesTab facilityId={facilityId} />);

    await waitFor(() => {
      expect(screen.getByText('Last User')).toBeInTheDocument();
    });
    expect(apiService.getUsers).toHaveBeenCalledTimes(2);
    expect(apiService.getUsers).toHaveBeenNthCalledWith(2, {
      facility: facilityId,
      limit: 200,
      offset: 200,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(screen.getByText(/Showing 201 of 201 users/)).toBeInTheDocument();
  });

  it('filters to tenants only without refetching', async () => {
    render(<UserSchedulesTab facilityId={facilityId} />);
    await waitFor(() => expect(screen.getByText('Alex Tenant')).toBeInTheDocument());
    expect(apiService.getUsers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tenants' }));

    expect(screen.getByText('Alex Tenant')).toBeInTheDocument();
    expect(screen.queryByText('Morgan Tech')).not.toBeInTheDocument();
    expect(apiService.getUsers).toHaveBeenCalledTimes(1);
  });

  it('toasts when Save is clicked without a selected schedule id', async () => {
    render(<UserSchedulesTab facilityId={facilityId} />);
    await waitFor(() => expect(screen.getByText('Alex Tenant')).toBeInTheDocument());

    const row = screen.getByText('Alex Tenant').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Change' }));

    const select = within(row).getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(within(row).getByRole('button', { name: /Save/i }));

    expect(addToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'Please select a schedule',
    });
    expect(apiService.setUserScheduleForFacility).not.toHaveBeenCalled();
  });

  it('assigns a schedule and reloads user data on success', async () => {
    render(<UserSchedulesTab facilityId={facilityId} />);
    await waitFor(() => expect(screen.getByText('Alex Tenant')).toBeInTheDocument());

    const row = screen.getByText('Alex Tenant').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Change' }));

    const select = within(row).getByRole('combobox');
    fireEvent.change(select, { target: { value: 'sched-default-tenant' } });

    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: /Save/i }));
    });

    await waitFor(() => {
      expect(apiService.setUserScheduleForFacility).toHaveBeenCalledWith(
        'tenant-1',
        facilityId,
        'sched-default-tenant',
      );
      expect(addToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Schedule assigned successfully',
      });
    });

    expect(apiService.getUsers.mock.calls.length).toBeGreaterThan(1);
  });

  it('filters by search query across name and unit number', async () => {
    render(<UserSchedulesTab facilityId={facilityId} />);
    await waitFor(() => expect(screen.getByText('Alex Tenant')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Search by name, email, or unit number/i), {
      target: { value: 'A-101' },
    });

    expect(screen.getByText('Alex Tenant')).toBeInTheDocument();
    expect(screen.queryByText('Morgan Tech')).not.toBeInTheDocument();
  });
});
