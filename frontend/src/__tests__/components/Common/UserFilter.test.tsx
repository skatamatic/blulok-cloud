/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFilter } from '@/components/Common/UserFilter';

const mockGetUsers = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUsers: (...args: unknown[]) => mockGetUsers(...args),
  },
}));

describe('UserFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUsers.mockResolvedValue({
      success: true,
      users: [
        {
          id: 'user-1',
          firstName: 'Taylor',
          lastName: 'Morgan',
          email: 't@example.com',
          role: 'tenant',
        },
      ],
      total: 1,
    });
  });

  it('loads users and selects one', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<UserFilter value="" onChange={onChange} placeholder="Search users..." />);

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalled();
    });

    await user.click(screen.getByPlaceholderText('Search users...'));

    await waitFor(() => {
      expect(screen.getByText(/Taylor Morgan/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Taylor Morgan/i }));
    expect(onChange).toHaveBeenCalledWith('user-1');
  });

  it('passes facility and role filters to getUsers', async () => {
    render(
      <UserFilter
        value=""
        onChange={jest.fn()}
        facilityId="fac-99"
        roleFilter="tenant"
      />
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          facility: 'fac-99',
          role: 'tenant',
        })
      );
    });
  });

  it('excludes user ids from results', async () => {
    mockGetUsers.mockResolvedValue({
      success: true,
      users: [
        { id: 'a', firstName: 'A', lastName: 'One', email: 'a@x.com', role: 'tenant' },
        { id: 'b', firstName: 'B', lastName: 'Two', email: 'b@x.com', role: 'tenant' },
      ],
      total: 2,
    });

    const user = userEvent.setup();
    render(
      <UserFilter value="" onChange={jest.fn()} excludeUserIds={['a']} placeholder="Search users..." />
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalled();
    });

    await user.click(screen.getByPlaceholderText('Search users...'));

    await waitFor(() => {
      expect(screen.queryByText(/A One/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/B Two/i)).toBeInTheDocument();
  });
});
