/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SimpleSiteMapPage from '@/pages/SimpleSiteMapPage';
import { apiService } from '@/services/api.service';

const mockNavigate = jest.fn();
const mockRequestUnlock = jest.fn();
const mockSyncLockStatus = jest.fn();
const mockIsSubmitting = jest.fn(() => false);

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { id: 'admin-1', role: 'admin' } },
  }),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: () => ({
    facilities: [{ id: 'fac-1', lock_timeout_seconds: 30 }],
  }),
}));

jest.mock('@/hooks/useBackNavigation', () => ({
  useDetailsBackNavigation: () => ({
    goBack: jest.fn(),
    showBack: true,
    backLabel: 'Back',
  }),
}));

jest.mock('@/hooks/useRemoteUnlockAction', () => ({
  useRemoteUnlockAction: () => ({
    requestUnlock: mockRequestUnlock,
    isSubmitting: mockIsSubmitting,
    syncLockStatus: mockSyncLockStatus,
    tenantOverrideDialog: null,
  }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: jest.fn(),
  },
}));

const mockGetUnits = apiService.getUnits as jest.Mock;

const units = [
  {
    id: 'unit-1',
    unit_number: 'A101',
    status: 'occupied',
    facility_id: 'fac-1',
    primary_tenant: {
      first_name: 'Alex',
      last_name: 'Tenant',
      email: 'alex@example.com',
    },
    blulok_device: {
      id: 'dev-1',
      lock_status: 'locked',
      battery_level: 15,
    },
  },
  {
    id: 'unit-2',
    unit_number: 'A102',
    status: 'available',
    facility_id: 'fac-1',
    blulok_device: {
      id: 'dev-2',
      lock_status: 'unlocked',
      battery_level: 80,
    },
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <SimpleSiteMapPage />
    </MemoryRouter>
  );
}

describe('SimpleSiteMapPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnits.mockResolvedValue({ units });
    mockRequestUnlock.mockResolvedValue(undefined);
  });

  it('loads units onto the map grid', async () => {
    renderPage();

    expect(await screen.findByText('A101')).toBeInTheDocument();
    expect(screen.getByText('A102')).toBeInTheDocument();
    expect(screen.getByText('Facility Site Map')).toBeInTheDocument();
    expect(mockGetUnits).toHaveBeenCalledWith({ limit: 100 });
  });

  it('handles load failure gracefully', async () => {
    mockGetUnits.mockRejectedValueOnce(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderPage();

    await waitFor(() => expect(mockGetUnits).toHaveBeenCalled());
    expect(screen.getByText('Facility Site Map')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('opens unit details panel and navigates to details', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('A101'));

    expect(screen.getByText('Unit A101')).toBeInTheDocument();
    expect(screen.getByText('Alex Tenant')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /View Details/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/units/unit-1');
  });

  it('closes the details panel', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('A101'));
    expect(screen.getByRole('heading', { name: 'Unit A101' })).toBeInTheDocument();

    const panelHeading = screen.getByRole('heading', { name: 'Unit A101' });
    const header = panelHeading.parentElement as HTMLElement;
    const closeBtn = header.querySelector('button');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Unit A101' })).not.toBeInTheDocument();
    });
  });

  it('requests remote unlock from the details panel', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('A101'));

    fireEvent.click(screen.getByRole('button', { name: /^Unlock$/i }));

    await waitFor(() => {
      expect(mockRequestUnlock).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          watchKey: 'unit-1',
          unitLabel: 'A101',
        })
      );
    });
  });

  it('navigates to list view', async () => {
    renderPage();
    await screen.findByText('A101');

    fireEvent.click(screen.getByRole('button', { name: /List View/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/units');
  });

  it('syncs lock status for loaded units', async () => {
    renderPage();
    await screen.findByText('A101');

    await waitFor(() => {
      expect(mockSyncLockStatus).toHaveBeenCalledWith('unit-1', 'locked');
      expect(mockSyncLockStatus).toHaveBeenCalledWith('unit-2', 'unlocked');
    });
  });
});
