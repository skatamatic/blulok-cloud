import { render, screen, waitFor } from '@testing-library/react';
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
      expect(screen.getByText('Schedules')).toBeInTheDocument();
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
        time_windows: [],
      },
    });

    render(<FacilitySchedulesTab facilityId={mockFacilityId} />);

    await waitFor(() => {
      expect(screen.getByText('Your Schedule')).toBeInTheDocument();
    });
  });
});

