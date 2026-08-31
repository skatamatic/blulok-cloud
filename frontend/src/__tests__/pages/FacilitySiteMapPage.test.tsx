/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FacilitySiteMapPage from '@/pages/FacilitySiteMapPage';
import { apiService } from '@/services/api.service';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { id: 'admin-1', role: 'admin' } },
  }),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  useGlobalFacility: () => ({
    activeFacility: { id: 'fac-1', name: 'North Site' },
  }),
}));

jest.mock('@/hooks/useBackNavigation', () => ({
  useDetailsBackNavigation: () => ({
    goBack: jest.fn(),
    showBack: true,
    backLabel: 'Back',
  }),
}));

jest.mock('@/hooks/useLockDeviceRealtime', () => ({
  useLockDeviceRealtime: jest.fn(),
}));

jest.mock('@/hooks/useRemoteUnlockAction', () => ({
  useRemoteUnlockAction: () => ({
    requestUnlock: jest.fn(),
    isUnlocking: false,
  }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('FacilitySiteMapPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getUnits.mockResolvedValue({ units: [], total: 0 } as any);
  });

  it('renders site map header and loads units', async () => {
    render(
      <MemoryRouter>
        <FacilitySiteMapPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockApi.getUnits).toHaveBeenCalled());
    expect(screen.getByText('Facility Site Map')).toBeInTheDocument();
  });
});
