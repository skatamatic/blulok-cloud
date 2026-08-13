/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFilter } from '@/components/Common/UserFilter';

const mockGetUsers = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUsers: (...args: unknown[]) => mockGetUsers(...args),
    getUser: (...args: unknown[]) => mockGetUser(...args),
  },
}));

describe('UserFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      user: {
        id: 'user-9',
        firstName: 'Jamie',
        lastName: 'Lee',
        email: 'j@example.com',
        role: 'tenant',
      },
    });
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

  it('resolves preselected user id to display name via getUser', async () => {
    const onDisplayLabelChange = jest.fn();

    render(
      <UserFilter
        value="user-9"
        onChange={jest.fn()}
        onDisplayLabelChange={onDisplayLabelChange}
      />,
    );

    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalledWith('user-9');
    });

    await waitFor(() => {
      expect(onDisplayLabelChange).toHaveBeenCalledWith('Jamie Lee');
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Jamie Lee')).toBeInTheDocument();
    });
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
          limit: 20,
          offset: 0,
        })
      );
    });
  });

  it('keeps typed search text after debounced fetch returns', async () => {
    const user = userEvent.setup();
    render(<UserFilter value="" onChange={jest.fn()} placeholder="Search users..." />);

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Search users...');
    await user.click(input);
    await user.type(input, 'tay');

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'tay' }),
      );
    });

    expect(input).toHaveValue('tay');
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

  it('clears the selection via All users when allowEmpty is set', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <UserFilter
        value="user-1"
        onChange={onChange}
        facilityId="fac-99"
        allowEmpty
        emptyLabel="All users"
        placeholder="Search users..."
      />,
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalled();
    });

    await user.click(screen.getByPlaceholderText('Search users...'));
    await user.click(await screen.findByRole('button', { name: /all users/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('lists only allowedUsers and does not call getUsers', async () => {
    const user = userEvent.setup();
    render(
      <UserFilter
        value=""
        onChange={jest.fn()}
        allowedUsers={[{ id: 'u1', name: 'Tester One', email: 't1@blulok.com' }]}
        placeholder="Users with events on this unit..."
      />,
    );

    expect(mockGetUsers).not.toHaveBeenCalled();
    await user.click(screen.getByPlaceholderText('Users with events on this unit...'));
    expect(await screen.findByText(/Tester One/)).toBeInTheDocument();
    expect(screen.queryByText(/Taylor Morgan/i)).not.toBeInTheDocument();
  });
});
