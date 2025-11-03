import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import UserDetailsPage from '@/pages/UserDetailsPage';
import { apiService } from '@/services/api.service';
import { UserRole } from '@/types/auth.types';
import { useAuth } from '@/contexts/AuthContext';

// Mock the API service
jest.mock('@/services/api.service');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock react-router-dom hooks
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ userId: 'test-user-id' }),
}));

// Mock auth context
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: jest.fn(),
}));

// Mock icons
jest.mock('@heroicons/react/24/outline', () => ({
  ArrowLeftIcon: () => <div data-testid="arrow-left-icon" />,
  UserIcon: () => <div data-testid="user-icon" />,
  BuildingOfficeIcon: () => <div data-testid="building-office-icon" />,
  DevicePhoneMobileIcon: () => <div data-testid="device-phone-mobile-icon" />,
  KeyIcon: () => <div data-testid="key-icon" />,
  TrashIcon: () => <div data-testid="trash-icon" />,
  ExclamationTriangleIcon: () => <div data-testid="exclamation-triangle-icon" />,
  TicketIcon: () => <div data-testid="ticket-icon" />,
  ClockIcon: () => <div data-testid="clock-icon" />,
  PaperAirplaneIcon: () => <div data-testid="paper-airplane-icon" />,
  PencilIcon: () => <div data-testid="pencil-icon" />,
  CheckCircleIcon: () => <div data-testid="check-circle-icon" />,
  LinkIcon: () => <div data-testid="link-icon" />,
}));

// Mock ConfirmModal
jest.mock('@/components/Modal/ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, onClose, onConfirm, title, message }: any) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onConfirm} data-testid="confirm-button">Delete Device</button>
        <button onClick={onClose} data-testid="cancel-button">Cancel</button>
      </div>
    ) : null,
}));

const mockUserDetails = {
  id: 'test-user-id',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.TENANT,
  isActive: true,
  lastLogin: '2024-01-15T10:30:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  facilities: [
    {
      id: 'facility-1',
      name: 'Main Office Building',
      address: '123 Main St, City, State',
      units: [
        {
          id: 'unit-1',
          unitNumber: '101',
          unitType: 'office',
          isPrimary: true,
        },
        {
          id: 'unit-2',
          unitNumber: '102',
          unitType: 'office',
          isPrimary: false,
        },
      ],
    },
  ],
  devices: [
    {
      id: 'device-1',
      app_device_id: 'device-123',
      platform: 'ios',
      device_name: 'John\'s iPhone',
      public_key: 'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF3',
      status: 'active',
      last_used_at: '2024-01-15T10:30:00Z',
      created_at: '2024-01-10T00:00:00Z',
      associatedLocks: [
        {
          lock_id: 'lock-1',
          device_serial: 'ABC123',
          unit_number: '101',
          facility_name: 'Main Office Building',
          key_status: 'added',
        },
      ],
    },
  ],
};

const mockAuthState = {
  user: {
    id: 'dev-admin-id',
    email: 'admin@example.com',
    firstName: 'Dev',
    lastName: 'Admin',
    role: UserRole.DEV_ADMIN,
  },
  token: 'mock-token',
  isAuthenticated: true,
  isLoading: false,
};

const renderUserDetailsPage = () => {
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    authState: mockAuthState,
    login: jest.fn(),
    logout: jest.fn(),
    isLoading: false,
    hasRole: jest.fn(),
    isAdmin: jest.fn(),
    canManageUsers: jest.fn().mockReturnValue(true),
  });

  return render(
    <MemoryRouter initialEntries={['/users/test-user-id/details']}>
      <ToastProvider>
        <Routes>
          <Route path="/users/:userId/details" element={<UserDetailsPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
};

describe('UserDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getUserDetails.mockResolvedValue({
      success: true,
      user: mockUserDetails,
    });
    mockApiService.getFacilities = jest.fn().mockResolvedValue({
      success: true,
      facilities: [],
    });
    mockApiService.getUserRoutePassHistory = jest.fn().mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  });

  describe('Loading State', () => {
    it('should show loading skeleton initially', () => {
      mockApiService.getUserDetails.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderUserDetailsPage();

      // Should show skeleton loading, not the actual content
      expect(screen.queryByText('User Information')).not.toBeInTheDocument();
      // Check for skeleton elements (they have bg-gray-200/bg-gray-700 classes)
      const skeletonElements = document.querySelectorAll('[class*="bg-gray-200"], [class*="bg-gray-700"]');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('should show error message when API fails', async () => {
      mockApiService.getUserDetails.mockRejectedValue(new Error('API Error'));

      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Error Loading User Details')).toBeInTheDocument();
        expect(screen.getByText('Failed to load user details')).toBeInTheDocument();
      });
    });

    it('should show back button in error state', async () => {
      mockApiService.getUserDetails.mockRejectedValue(new Error('API Error'));

      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Back to Users')).toBeInTheDocument();
      });
    });
  });

  describe('Header', () => {
    it('should display user name and email', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        const nameElements = screen.getAllByText(/John Doe/);
        expect(nameElements.length).toBeGreaterThan(0);
        const emailElements = screen.getAllByText('john.doe@example.com');
        expect(emailElements.length).toBeGreaterThan(0);
      });
    });

    it('should display user role and status badges', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        const tenantElements = screen.getAllByText('tenant');
        expect(tenantElements.length).toBeGreaterThan(0);
        const activeElements = screen.getAllByText('Active');
        expect(activeElements.length).toBeGreaterThan(0);
      });
    });

    it('should have back button that navigates to users page', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Back to Users')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back to Users'));
      expect(mockNavigate).toHaveBeenCalledWith('/users');
    });
  });

  describe('Tabs', () => {
    it('should render all tabs', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Summary')).toBeInTheDocument();
        expect(screen.getByText('Facilities (1)')).toBeInTheDocument();
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });
    });

    it('should show summary tab by default', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('User Information')).toBeInTheDocument();
      });
    });

    it('should switch to facilities tab when clicked', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Facilities (1)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Facilities (1)'));

      expect(screen.getByText('Main Office Building')).toBeInTheDocument();
      expect(screen.getByText('Assigned Units (2)')).toBeInTheDocument();
    });

    it('should switch to devices tab when clicked', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Devices (1)'));

      expect(screen.getByText('John\'s iPhone')).toBeInTheDocument();
      expect(screen.getByText('Associated Locks (1)')).toBeInTheDocument();
    });
  });

  describe('Summary Tab', () => {
    it('should display basic user information', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Full Name')).toBeInTheDocument();
        const nameElements = screen.getAllByText(/John Doe/);
        expect(nameElements.length).toBeGreaterThan(0);
        expect(screen.getByText('Email')).toBeInTheDocument();
        const emailElements = screen.getAllByText('john.doe@example.com');
        expect(emailElements.length).toBeGreaterThan(0);
      });
    });

    it('should display account activity information', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Account Activity')).toBeInTheDocument();
        expect(screen.getByText('Last Login')).toBeInTheDocument();
        expect(screen.getByText('Account Created')).toBeInTheDocument();
      });
    });
  });

  describe('Facilities Tab', () => {
    beforeEach(async () => {
      renderUserDetailsPage();
      await waitFor(() => {
        expect(screen.getByText('Facilities (1)')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Facilities (1)'));
    });

    it('should display facility information', async () => {
      expect(screen.getByText('Main Office Building')).toBeInTheDocument();
      expect(screen.getByText('123 Main St, City, State')).toBeInTheDocument();
    });

    it('should display assigned units', async () => {
      expect(screen.getByText('Assigned Units (2)')).toBeInTheDocument();
      expect(screen.getByText('Unit 101')).toBeInTheDocument();
      expect(screen.getByText('Unit 102')).toBeInTheDocument();
    });

    it('should show primary unit badge', async () => {
      expect(screen.getByText('Primary')).toBeInTheDocument();
    });
  });

  describe('Devices Tab', () => {
    beforeEach(async () => {
      renderUserDetailsPage();
      await waitFor(() => {
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Devices (1)'));
    });

    it('should display device information', async () => {
      expect(screen.getByText('John\'s iPhone')).toBeInTheDocument();
      expect(screen.getByText('iOS • ID: device-123')).toBeInTheDocument();
    });

    it('should display device status', async () => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('should display public key', async () => {
      expect(screen.getByText('Public Key')).toBeInTheDocument();
      expect(screen.getByText(/LS0tLS1CRUdJTi/)).toBeInTheDocument();
    });

    it('should display associated locks', async () => {
      expect(screen.getByText('Associated Locks (1)')).toBeInTheDocument();
      expect(screen.getByText('Main Office Building - Unit 101')).toBeInTheDocument();
      expect(screen.getByText('Serial: ABC123')).toBeInTheDocument();
      expect(screen.getAllByText('Active')).toHaveLength(2); // User status and key status
    });

    it('should have delete button', async () => {
      expect(screen.getByTitle('Delete device')).toBeInTheDocument();
    });

    it('should open delete confirmation modal when delete button is clicked', async () => {
      const deleteButton = screen.getByTitle('Delete device');
      fireEvent.click(deleteButton);

      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      const titleElements = screen.getAllByText('Delete Device');
      expect(titleElements.length).toBeGreaterThan(0);
    });

    it('should call delete API when confirmed', async () => {
      mockApiService.deleteUserDevice.mockResolvedValue({
        success: true,
        message: 'Device deleted successfully',
      });

      const deleteButton = screen.getByTitle('Delete device');
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockApiService.deleteUserDevice).toHaveBeenCalledWith('device-1');
      });
    });

    it('should reload user details after successful deletion', async () => {
      mockApiService.deleteUserDevice.mockResolvedValue({
        success: true,
        message: 'Device deleted successfully',
      });

      const deleteButton = screen.getByTitle('Delete device');
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByTestId('confirm-button');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockApiService.getUserDetails).toHaveBeenCalledTimes(2); // Initial load + reload
      });
    });
  });

  describe('RBAC', () => {
    it('should show devices tab for DEV_ADMIN users', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });
    });

    it('should not show devices tab for non-DEV_ADMIN users', async () => {
      const nonDevAdminAuthState = {
        ...mockAuthState,
        user: {
          ...mockAuthState.user,
          role: UserRole.ADMIN,
        },
      };

      (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
        authState: nonDevAdminAuthState,
        login: jest.fn(),
        logout: jest.fn(),
        isLoading: false,
        hasRole: jest.fn(),
        isAdmin: jest.fn(),
        canManageUsers: jest.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/users/test-user-id/details']}>
          <ToastProvider>
            <Routes>
              <Route path="/users/:userId/details" element={<UserDetailsPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByText('Devices')).not.toBeInTheDocument();
      });
    });
  });

  describe('Device Status Formatting', () => {
    it('should format device platform correctly', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Devices (1)'));

      await waitFor(() => {
        // The platform text shows as "iOS • ID: device-123" so look for individual parts
        expect(screen.getByText(/iOS/)).toBeInTheDocument();
        expect(screen.getByText(/device-123/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should format key status correctly', async () => {
      renderUserDetailsPage();

      await waitFor(() => {
        expect(screen.getByText('Devices (1)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Devices (1)'));

      await waitFor(() => {
        expect(screen.getAllByText('Active')).toHaveLength(2); // User status and key status
      });
    });
  });

  describe('Empty States', () => {
    it('should show no facilities message when user has no facilities', async () => {
      const userWithNoFacilities = {
        ...mockUserDetails,
        facilities: [],
      };

      mockApiService.getUserDetails.mockResolvedValue({
        success: true,
        user: userWithNoFacilities,
      });

      // Mock canManageUsers to return false to see the "No Facilities Assigned" message
      (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
        authState: mockAuthState,
        login: jest.fn(),
        logout: jest.fn(),
        isLoading: false,
        hasRole: jest.fn(),
        isAdmin: jest.fn(),
        canManageUsers: jest.fn().mockReturnValue(false),
      });

      const { render } = require('@testing-library/react');
      render(
        <MemoryRouter initialEntries={['/users/test-user-id/details']}>
          <ToastProvider>
            <Routes>
              <Route path="/users/:userId/details" element={<UserDetailsPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        fireEvent.click(screen.getByText('Facilities (0)'));
      });

      await waitFor(() => {
      expect(screen.getByText('No Facilities Assigned')).toBeInTheDocument();
      });
    });

    it('should show no devices message when user has no devices', async () => {
      const userWithNoDevices = {
        ...mockUserDetails,
        devices: [],
      };

      mockApiService.getUserDetails.mockResolvedValue({
        success: true,
        user: userWithNoDevices,
      });

      renderUserDetailsPage();

      await waitFor(() => {
        fireEvent.click(screen.getByText('Devices (0)'));
      });

      expect(screen.getByText('No Devices Registered')).toBeInTheDocument();
    });
  });
});
