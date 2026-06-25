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
    first_name: 'Sam',
    last_name: 'Shared',
    email: 'sam@example.com',
    role: UserRole.TENANT,
    access_reasons: ['shared_key'],
    unit_numbers: ['102'],
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

    expect(screen.getByText(/Tenants and shared-key holders with access to units in this group/)).toBeInTheDocument();
    expect(screen.getByText('Jane Tenant')).toBeInTheDocument();
    expect(screen.getByText('Primary tenant')).toBeInTheDocument();
    expect(screen.getByText('Units: Unit 101')).toBeInTheDocument();
    expect(screen.getAllByText('View details')).toHaveLength(2);
    expect(screen.getByText('Sam Shared')).toBeInTheDocument();
    expect(screen.getByText('Shared key')).toBeInTheDocument();
  });

  it('shows empty state when no users match', () => {
    render(
      <MemoryRouter>
        <AccessGroupUsersPanel users={[]} loading={false} hasUnitLocks loadError={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No users found')).toBeInTheDocument();
    expect(screen.getByText(/No tenants or shared-key holders match this group yet/)).toBeInTheDocument();
  });
});
