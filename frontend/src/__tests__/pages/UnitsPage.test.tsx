/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

const mockAddToast = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: mockAddToast,
    removeToast: jest.fn(),
    clearAllToasts: jest.fn(),
    toasts: [],
  }),
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
const mockUpdateLockStatus = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
    getMyUnits: (...args: unknown[]) => mockGetMyUnits(...args),
    getUsers: (...args: unknown[]) => mockGetUsers(...args),
    updateLockStatus: (...args: unknown[]) => mockUpdateLockStatus(...args),
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

const unitWithLockedDevice = {
  ...sampleUnit,
  blulok_device: {
    id: 'dev-1',
    device_serial: 'SN1',
    lock_status: 'locked',
    device_status: 'online',
  },
};

const unitWithErrorLock = {
  ...sampleUnit,
  id: 'unit-err',
  unit_number: '404',
  blulok_device: {
    id: 'dev-2',
    device_serial: 'SN2',
    lock_status: 'error',
    device_status: 'error',
  },
};

describe('UnitsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateLockStatus.mockResolvedValue({});
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

  describe('lock controls (facility admin)', () => {
    it('disables lock control when the unit has no BluLok device', async () => {
      mockGetUnits.mockImplementation(async (filters: { offset?: number; limit?: number }) => {
        if (filters?.offset === undefined && filters?.limit === undefined) {
          return { units: [sampleUnit], total: 1 };
        }
        return { units: [sampleUnit], total: 1 };
      });

      render(
        <MemoryRouter>
          <UnitsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/unit 101/i)).toBeInTheDocument();
      });

      const lockBtn = screen.getByRole('button', {
        name: /Lock control unavailable — no device on this unit/i,
      });
      expect(lockBtn).toBeDisabled();
    });

    it('disables lock control when lock_status is not toggleable', async () => {
      mockGetUnits.mockImplementation(async (filters: { offset?: number; limit?: number }) => {
        if (filters?.offset === undefined && filters?.limit === undefined) {
          return { units: [unitWithErrorLock], total: 1 };
        }
        return { units: [unitWithErrorLock], total: 1 };
      });

      render(
        <MemoryRouter>
          <UnitsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/unit 404/i)).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /Lock control unavailable, status error/i })
      ).toBeDisabled();
    });

    it('unlocks when the device is locked', async () => {
      const lockedPage = { units: [unitWithLockedDevice], total: 1 };
      const unlockedUnit = {
        ...unitWithLockedDevice,
        blulok_device: {
          ...unitWithLockedDevice.blulok_device,
          lock_status: 'unlocked' as const,
        },
      };
      const unlockedPage = { units: [unlockedUnit], total: 1 };
      mockGetUnits
        .mockResolvedValueOnce(lockedPage)
        .mockResolvedValueOnce(lockedPage)
        .mockResolvedValue(unlockedPage);

      render(
        <MemoryRouter>
          <UnitsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Unlock unit$/i })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Unlock unit$/i }));
      });

      await waitFor(() => {
        expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
      });
      expect(mockAddToast).not.toHaveBeenCalled();
    });

    it('shows a toast when the lock API fails', async () => {
      const lockedPage = { units: [unitWithLockedDevice], total: 1 };
      mockGetUnits
        .mockResolvedValueOnce(lockedPage)
        .mockResolvedValueOnce(lockedPage)
        .mockResolvedValue(lockedPage);
      mockUpdateLockStatus.mockRejectedValueOnce({
        response: { data: { message: 'Gateway timeout' } },
      });

      render(
        <MemoryRouter>
          <UnitsPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Unlock unit$/i })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Unlock unit$/i }));
      });

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            title: 'Could not update lock',
            message: 'Gateway timeout',
          })
        );
      });
    });
  });
});
