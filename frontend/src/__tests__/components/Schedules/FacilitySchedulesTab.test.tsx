/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FacilitySchedulesTab } from '@/components/Schedules/FacilitySchedulesTab';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

// Mock dependencies
jest.mock('@/services/api.service');
jest.mock('@/contexts/AuthContext');
jest.mock('@/contexts/ToastContext');

describe('FacilitySchedulesTab', () => {
  const mockFacilityId = 'test-facility-id';
  const mockUserId = 'test-user-id';

  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      authState: {
        user: {
          id: mockUserId,
          role: 'admin',
        },
      },
    });

    (useToast as jest.Mock).mockReturnValue({
      addToast: jest.fn(),
    });
  });

  it('should render schedules tab for admin', async () => {
    (apiService.getFacilitySchedules as jest.Mock).mockResolvedValue({
      schedules: [],
      total: 0,
    });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);

    await waitFor(() => {
      expect(screen.getByText('Custom Schedules')).toBeInTheDocument();
    });
  });

  it('should show read-only view for tenants', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      authState: {
        user: {
          id: mockUserId,
          role: 'tenant',
        },
      },
    });

    (apiService.getUserScheduleForFacility as jest.Mock).mockResolvedValue({
      schedule: {
        id: 'test-schedule',
        name: 'My Schedule',
        facility_id: mockFacilityId,
        schedule_type: 'custom',
        is_active: true,
        created_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        time_windows: [],
      },
    });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);

    await waitFor(() => {
      // The component renders a ScheduleVisualizer for read-only view, which shows day labels
      expect(screen.getByText('Mon')).toBeInTheDocument();
    });
  });

  it('shows empty assignment message for tenants without a schedule', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      authState: { user: { id: mockUserId, role: 'tenant' } },
    });
    (apiService.getFacilitySchedules as jest.Mock).mockResolvedValue({ schedules: [], total: 0 });
    (apiService.getUserScheduleForFacility as jest.Mock).mockResolvedValue({ schedule: null });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);

    expect(
      await screen.findByText(/No schedule assigned. Please contact your facility administrator./i)
    ).toBeInTheDocument();
  });

  it('toasts when facility schedules fail to load', async () => {
    const addToast = jest.fn();
    (useToast as jest.Mock).mockReturnValue({ addToast });
    (apiService.getFacilitySchedules as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Schedules unavailable' } },
    });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Failed to load schedules',
          message: 'Schedules unavailable',
        })
      );
    });
  });

  it('lists custom schedules and opens create form', async () => {
    (apiService.getFacilitySchedules as jest.Mock).mockResolvedValue({
      schedules: [
        {
          id: 'sched-1',
          name: 'Weekend Access',
          facility_id: mockFacilityId,
          schedule_type: 'custom',
          is_active: true,
          created_by: mockUserId,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          time_windows: [],
        },
      ],
      total: 1,
    });

    render(
      <FacilitySchedulesTab
        facilityId={mockFacilityId}
        createDialogOpen
        onCreateDialogChange={jest.fn()}
      />,
    );

    expect(await screen.findByText('Weekend Access')).toBeInTheDocument();
    expect(screen.getByText('Custom Schedules')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Schedule/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter schedule name')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Schedule' })).toBeInTheDocument();
  });

  it('opens delete confirmation with usage details', async () => {
    (apiService.getFacilitySchedules as jest.Mock).mockResolvedValue({
      schedules: [
        {
          id: 'sched-1',
          name: 'Weekend Access',
          facility_id: mockFacilityId,
          schedule_type: 'custom',
          is_active: true,
          created_by: mockUserId,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          time_windows: [],
        },
      ],
      total: 1,
    });
    (apiService.getScheduleUsage as jest.Mock).mockResolvedValue({
      usage: { tenantCount: 2, maintenanceCount: 1, totalCount: 3 },
    });
    (apiService.deleteSchedule as jest.Mock).mockResolvedValue({ success: true });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);
    await screen.findByText('Weekend Access');

    fireEvent.click(screen.getByTitle('Delete schedule'));

    expect(await screen.findByText(/in use by 2 tenants and 1 maintenance user/i)).toBeInTheDocument();

    const confirmButtons = screen.getAllByText('Delete Schedule');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiService.deleteSchedule).toHaveBeenCalledWith(mockFacilityId, 'sched-1');
    });
  });
});

