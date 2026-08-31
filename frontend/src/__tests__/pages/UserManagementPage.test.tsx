/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import UserManagementPage from '@/pages/UserManagementPage';
import { UserRole } from '@/types/auth.types';

const mockNavigate = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

jest.mock('@/hooks/useHighlight', () => ({
  useHighlight: jest.fn(),
}));

jest.mock('@/components/UserManagement/AddUserModal', () => ({
  AddUserModal: () => null,
}));

const mockGetUsers = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUsers: (...args: unknown[]) => mockGetUsers(...args),
  },
}));

const baseUser = {
  id: 'user-1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: UserRole.TENANT,
  isActive: true,
  createdAt: '2020-01-01T00:00:00.000Z',
};

describe('UserManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      isLoading: false,
    });
    mockGetUsers.mockResolvedValue({
      success: true,
      users: [baseUser],
      total: 1,
    });
  });

  it('renders header and loads users', async () => {
    render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /user management/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    });

    expect(mockGetUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
      })
    );
  });

  it('shows an error when the API reports failure', async () => {
    mockGetUsers.mockResolvedValue({ success: false, users: [], total: 0 });

    render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch users/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no users', async () => {
    mockGetUsers.mockResolvedValue({ success: true, users: [], total: 0 });

    render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no users found/i)).toBeInTheDocument();
    });
  });

  it('navigates to user details when a row is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Ada Lovelace'));

    expect(mockNavigate).toHaveBeenCalledWith('/users/user-1/details', {
      state: { fromPath: '/', returnState: null },
    });
  });

  it('scopes fetch to facility when one is selected', async () => {
    const facilityId = 'fac-123';
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: facilityId,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith(
        expect.objectContaining({ facility: facilityId })
      );
    });
  });

  it('clears the skeleton when a refresh supersedes the initial load', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;

    mockGetUsers
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      isLoading: false,
    });

    const { rerender } = render(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledTimes(1);
    });

    // Facility scope settles to a specific facility → debounced refresh after first paint.
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'fac-after-setup',
      isLoading: false,
    });
    rerender(
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledTimes(2);
    });

    resolveSecond({
      success: true,
      users: [{ ...baseUser, id: 'user-2', firstName: 'Grace', lastName: 'Hopper' }],
      total: 1,
    });

    await waitFor(() => {
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    });

    // Stale initial response must not resurrect the skeleton.
    resolveFirst({
      success: true,
      users: [baseUser],
      total: 1,
    });

    await waitFor(() => {
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(document.querySelectorAll('tr.animate-pulse')).toHaveLength(0);
  });
});
