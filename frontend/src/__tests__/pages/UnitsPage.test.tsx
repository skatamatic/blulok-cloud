/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UnitsPage from '@/pages/UnitsPage';
import { UserRole } from '@/types/auth.types';

const mockNavigate = jest.fn();
const mockUseGlobalFacility = jest.fn();
const mockUseAuth = jest.fn();
const mockSubscribe = jest.fn(() => 'sub-1');
const mockUnsubscribe = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

jest.mock('@/hooks/useHighlightWithPagination', () => ({
  useHighlightWithPagination: jest.fn(),
}));

jest.mock('@/components/Units/AddUnitModal', () => ({
  AddUnitModal: () => null,
}));

const mockGetUnits = jest.fn();
const mockGetMyUnits = jest.fn();
const mockGetUsers = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
    getMyUnits: (...args: unknown[]) => mockGetMyUnits(...args),
    getUsers: (...args: unknown[]) => mockGetUsers(...args),
  },
}));

const sampleUnit = {
  id: 'unit-1',
  facility_id: 'fac-1',
  unit_number: '101',
  unit_type: 'standard',
  status: 'available' as const,
  created_at: '2020-01-01',
  updated_at: '2020-01-01',
};

describe('UnitsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: 'fac-1',
    });
    mockUseAuth.mockReturnValue({
      authState: {
        user: { role: UserRole.FACILITY_ADMIN },
      },
    });
    mockGetUsers.mockResolvedValue({ success: true, users: [] });
    mockGetUnits.mockImplementation(async (filters: { offset?: number; limit?: number }) => {
      if (filters?.offset === undefined && filters?.limit === undefined) {
        return { units: [sampleUnit], total: 1 };
      }
      return { units: [sampleUnit], total: 1 };
    });
  });

  it('shows Units heading and loads units for staff when facility is selected', async () => {
    render(
      <MemoryRouter>
        <UnitsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /^units$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/unit 101/i)).toBeInTheDocument();
    });

    expect(mockGetUnits).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalledWith('units', expect.any(Function), undefined);
  });

  it('uses getMyUnits for tenants', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: { role: UserRole.TENANT },
      },
    });
    mockGetMyUnits.mockResolvedValue({ units: [sampleUnit], total: 1 });

    render(
      <MemoryRouter>
        <UnitsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /my units/i })).toBeInTheDocument();
    });

    expect(mockGetMyUnits).toHaveBeenCalled();
    expect(mockGetUnits).not.toHaveBeenCalled();
  });

  it('shows empty state when staff has no facility selected', async () => {
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: null,
    });

    render(
      <MemoryRouter>
        <UnitsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetUnits).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/no units found/i)).toBeInTheDocument();
    });
  });
});
