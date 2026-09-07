/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacilityAssignmentModal } from '@/components/UserManagement/FacilityAssignmentModal';
import { apiService } from '@/services/api.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getFacilities: jest.fn(),
    setUserFacilities: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const user = {
  id: 'user-1',
  firstName: 'Jane',
  lastName: 'Admin',
  role: UserRole.FACILITY_ADMIN,
  facilityIds: [],
};

describe('FacilityAssignmentModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getFacilities.mockResolvedValue({
      facilities: [
        { id: 'fac-1', name: 'North Site', status: 'active' },
        { id: 'fac-2', name: 'South Site', status: 'active' },
      ],
    } as any);
    mockApi.setUserFacilities.mockResolvedValue({ success: true } as any);
  });

  it('loads facilities when opened', async () => {
    render(
      <FacilityAssignmentModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        user={user}
      />
    );

    await waitFor(() => expect(mockApi.getFacilities).toHaveBeenCalled());
    expect(await screen.findByText('North Site')).toBeInTheDocument();
    expect(screen.getByText('South Site')).toBeInTheDocument();
  });

  it('submits selected facility ids', async () => {
    const onSuccess = jest.fn();
    render(
      <FacilityAssignmentModal
        isOpen
        onClose={jest.fn()}
        onSuccess={onSuccess}
        user={user}
      />
    );

    await screen.findByText('North Site');
    await userEvent.click(screen.getByLabelText(/North Site/i));
    await userEvent.click(screen.getByRole('button', { name: /Update Assignments/i }));

    await waitFor(() =>
      expect(mockApi.setUserFacilities).toHaveBeenCalledWith('user-1', ['fac-1'])
    );
    expect(onSuccess).toHaveBeenCalled();
  });
});
