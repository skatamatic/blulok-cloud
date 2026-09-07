/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantAssignmentModal } from '@/components/Units/TenantAssignmentModal';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUsers: jest.fn(),
    assignTenantToUnit: jest.fn(),
    removeTenantFromUnit: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const unit = {
  id: 'unit-1',
  unit_number: 'A-101',
  facility_id: 'fac-1',
  status: 'available',
  unit_type: 'storage',
  created_at: '',
  updated_at: '',
  tenants: [],
};

describe('TenantAssignmentModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getUsers.mockResolvedValue({
      users: [
        {
          id: 'tenant-1',
          email: 'tenant@example.com',
          firstName: 'T',
          lastName: 'One',
          role: 'tenant',
        },
      ],
      total: 1,
    } as any);
    mockApi.assignTenantToUnit.mockResolvedValue({ success: true } as any);
  });

  it('loads tenants when opened', async () => {
    render(
      <TenantAssignmentModal
        isOpen
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        unit={unit as any}
      />
    );

    await waitFor(() => expect(mockApi.getUsers).toHaveBeenCalledWith({ role: 'tenant' }));
    expect(await screen.findByText(/tenant@example.com/i)).toBeInTheDocument();
  });

  it('does not load tenants when closed', () => {
    render(
      <TenantAssignmentModal
        isOpen={false}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        unit={unit as any}
      />
    );
    expect(mockApi.getUsers).not.toHaveBeenCalled();
  });

  it('assigns selected tenant on submit', async () => {
    const onSuccess = jest.fn();
    render(
      <TenantAssignmentModal
        isOpen
        onClose={jest.fn()}
        onSuccess={onSuccess}
        unit={unit as any}
      />
    );

    await screen.findByText(/T One/i);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'tenant-1');
    await userEvent.click(screen.getByRole('button', { name: /Assign Primary Access/i }));

    await waitFor(() =>
      expect(mockApi.assignTenantToUnit).toHaveBeenCalledWith('unit-1', 'tenant-1', true)
    );
    expect(onSuccess).toHaveBeenCalled();
  });
});
