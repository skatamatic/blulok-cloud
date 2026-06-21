import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import UnitDetailsPage from '@/pages/UnitDetailsPage';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnitDetails: jest.fn(),
    assignTenantToUnit: jest.fn(),
    removeTenantFromUnit: jest.fn(),
    getDeviceGroups: jest.fn(),
    getDeviceGroup: jest.fn(),
    updateLockStatus: jest.fn(),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: jest.fn(),
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-id'),
    unsubscribe: jest.fn(),
  }),
}));

jest.mock('@/hooks/useBackNavigation', () => ({
  ...jest.requireActual('@/hooks/useBackNavigation'),
  useBackNavigation: () => jest.fn(),
  useDetailsBackNavigation: () => ({
    showBack: true,
    backLabel: 'Back to Units',
    goBack: jest.fn(),
  }),
}));

jest.mock('@/components/Common/UserFilter', () => ({
  UserFilter: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('tenant-2')}>
      Mock Select Tenant
    </button>
  ),
}));

jest.mock('@/components/Units/EditUnitModal', () => ({
  EditUnitModal: () => null,
}));

jest.mock('@/components/Devices/DeviceAssignmentModal', () => ({
  DeviceAssignmentModal: () => null,
}));

jest.mock('@/components/Units/ShareKeyModal', () => ({
  ShareKeyModal: () => null,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ unitId: 'unit-1' }),
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockUseAuth = useAuth as jest.Mock;
const mockUseGlobalFacility = useGlobalFacility as jest.Mock;

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
};

const tenantUser = {
  id: 'tenant-primary',
  email: 'tenant@example.com',
  firstName: 'Primary',
  lastName: 'Tenant',
  role: 'tenant',
};

const nonPrimaryTenantUser = {
  id: 'tenant-other',
  email: 'othertenant@example.com',
  firstName: 'Other',
  lastName: 'Tenant',
  role: 'tenant',
};

const baseUnit = {
  id: 'unit-1',
  unit_number: 'A-101',
  unit_type: 'storage',
  status: 'occupied',
  facility_id: 'facility-1',
  facility_name: 'Main Facility',
  facility_address: '123 Main St',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  primary_tenant: {
    id: 'tenant-primary',
    first_name: 'Primary',
    last_name: 'Tenant',
    email: 'tenant@example.com',
  },
  shared_tenants: [],
};

const unitWithoutPrimary = {
  ...baseUnit,
  primary_tenant: undefined,
};

describe('UnitDetailsPage shared access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      facilities: [{ id: 'facility-1', name: 'Main Facility', lock_command_timeout_sec: 10 }],
      selectedFacilityId: 'facility-1',
      selectedFacility: { id: 'facility-1', name: 'Main Facility', lock_command_timeout_sec: 10 },
      isAllFacilitiesSelected: false,
      isLoading: false,
      hasMultipleFacilities: false,
      setSelectedFacilityId: jest.fn(),
      refreshFacilities: jest.fn(),
    });
    mockApiService.assignTenantToUnit.mockResolvedValue({ success: true } as any);
    mockApiService.removeTenantFromUnit.mockResolvedValue({ success: true } as any);
    mockApiService.getDeviceGroups.mockResolvedValue({ data: [] } as any);
    mockApiService.getDeviceGroup.mockResolvedValue({ data: { members: [] } } as any);
  });

  it('keeps add flow visible after selecting tenant and submits assignment', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: adminUser,
        isAuthenticated: true,
      },
    });
    mockApiService.getUnitDetails.mockResolvedValue({ unit: baseUnit } as any);

    render(
      <MemoryRouter initialEntries={['/units/unit-1']}>
        <ToastProvider>
          <UnitDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to units/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tenant & Sharing' }));
    fireEvent.click(screen.getByRole('button', { name: /add shared/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Select Tenant' }));

    // Regression check: action should remain visible after tenant selection.
    expect(screen.getByRole('button', { name: /add access/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add access/i }));

    await waitFor(() => {
      expect(mockApiService.assignTenantToUnit).toHaveBeenCalledWith('unit-1', 'tenant-2', false);
    });
  });

  it('shows shared access controls for the primary tenant', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: tenantUser,
        isAuthenticated: true,
      },
    });
    mockApiService.getUnitDetails.mockResolvedValue({ unit: baseUnit } as any);

    render(
      <MemoryRouter initialEntries={['/units/unit-1']}>
        <ToastProvider>
          <UnitDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to units/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tenant & Sharing' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add shared/i })).toBeInTheDocument();
    });
  });

  it('hides shared access controls for non-primary tenants', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: nonPrimaryTenantUser,
        isAuthenticated: true,
      },
    });
    mockApiService.getUnitDetails.mockResolvedValue({ unit: baseUnit } as any);

    render(
      <MemoryRouter initialEntries={['/units/unit-1']}>
        <ToastProvider>
          <UnitDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to units/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tenant & Sharing' }));
    expect(screen.queryByRole('button', { name: /add shared/i })).not.toBeInTheDocument();
  });

  it('allows admin to assign a primary tenant from unit details', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: adminUser,
        isAuthenticated: true,
      },
    });
    mockApiService.getUnitDetails.mockResolvedValue({ unit: unitWithoutPrimary } as any);

    render(
      <MemoryRouter initialEntries={['/units/unit-1']}>
        <ToastProvider>
          <UnitDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to units/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tenant & Sharing' }));
    fireEvent.click(screen.getByRole('button', { name: /assign primary/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Select Tenant' }));
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(mockApiService.assignTenantToUnit).toHaveBeenCalledWith('unit-1', 'tenant-2', true);
    });
  });
});