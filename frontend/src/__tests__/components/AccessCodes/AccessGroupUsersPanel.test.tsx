import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessGroupUsersPanel } from '@/components/AccessCodes/AccessGroupUsersPanel';
import { UserRole } from '@/types/auth.types';
import type { GroupUserAccess } from '@/components/AccessCodes/access-groups.utils';

const sampleUsers: GroupUserAccess[] = [
  {
    user_id: 'user-1',
    first_name: 'Jane',
    last_name: 'Tenant',
    email: 'jane@example.com',
    role: UserRole.TENANT,
    access_reasons: ['primary_tenant'],
    unit_numbers: ['101'],
  },
  {
    user_id: 'user-2',
    first_name: 'Pat',
    last_name: 'Manager',
    email: 'fa@example.com',
    role: UserRole.FACILITY_ADMIN,
    access_reasons: ['facility_admin'],
    unit_numbers: [],
  },
];

describe('AccessGroupUsersPanel', () => {
  it('renders loading skeleton', () => {
    const { container } = render(
      <MemoryRouter>
        <AccessGroupUsersPanel users={[]} loading hasUnitLocks={false} loadError={null} />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('renders users with access reasons and detail links', () => {
    render(
      <MemoryRouter>
        <AccessGroupUsersPanel users={sampleUsers} loading={false} hasUnitLocks loadError={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Users with access to units in this group/)).toBeInTheDocument();
    expect(screen.getByText('Jane Tenant')).toBeInTheDocument();
    expect(screen.getByText('Primary tenant')).toBeInTheDocument();
    expect(screen.getByText('Units: Unit 101')).toBeInTheDocument();
    expect(screen.getAllByText('View details')).toHaveLength(2);
    expect(screen.getByText('Pat Manager')).toBeInTheDocument();
    expect(screen.getByText('Facility admin')).toBeInTheDocument();
    expect(screen.queryByText('Facility Admin')).not.toBeInTheDocument();
  });

  it('shows empty state when no users match', () => {
    render(
      <MemoryRouter>
        <AccessGroupUsersPanel users={[]} loading={false} hasUnitLocks loadError={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No users found')).toBeInTheDocument();
    expect(screen.getByText(/No tenants, shared-key holders, or admins match this group yet/)).toBeInTheDocument();
  });
});
