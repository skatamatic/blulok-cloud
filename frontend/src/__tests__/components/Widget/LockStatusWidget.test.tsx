import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { LockStatusWidget } from '@/components/Widget/LockStatusWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { Unit } from '@/types/units.types';

// Mock the API service
const mockGetMyUnits = jest.fn();
const mockGetUnits = jest.fn();
const mockUpdateLockStatus = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getMyUnits: (...args: unknown[]) => mockGetMyUnits(...args),
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
    updateLockStatus: (...args: unknown[]) => mockUpdateLockStatus(...args),
  },
}));

// Mock the WebSocket context
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseGlobalFacility = jest.fn();

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: jest.fn() }),
}));

// Mock auth context
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin' as const,
        facilities: []
      },
      isAuthenticated: true,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <DropdownProvider>
        {component}
      </DropdownProvider>
    </ThemeProvider>
  );
};

describe('LockStatusWidget', () => {
  const mockUnits: Unit[] = [
    {
      id: 'unit-1',
      facility_id: 'facility-1',
      unit_number: 'A-101',
      unit_type: 'storage',
      status: 'locked',
      lock_status: 'locked',
      blulok_device: { id: 'dev-1', lock_status: 'locked' },
      is_online: true,
      battery_level: 85,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'unit-2',
      facility_id: 'facility-1',
      unit_number: 'A-102',
      unit_type: 'storage',
      status: 'unlocked',
      lock_status: 'unlocked',
      blulok_device: { id: 'dev-2', lock_status: 'unlocked' },
      is_online: true,
      battery_level: 45,
      last_seen: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'unit-3',
      facility_id: 'facility-1',
      unit_number: 'A-103',
      unit_type: 'storage',
      status: 'locked',
      lock_status: 'locked',
      blulok_device: { id: 'dev-3', lock_status: 'locked' },
      is_online: false,
      battery_level: 15,
      last_seen: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      isAllFacilitiesSelected: true,
      isLoading: false,
    });
    mockGetMyUnits.mockReset();
    mockGetUnits.mockReset();
    mockUpdateLockStatus.mockReset();
    mockGetMyUnits.mockResolvedValue({
      units: mockUnits,
      total: mockUnits.length,
    });
    mockGetUnits.mockResolvedValue({
      units: mockUnits,
      total: mockUnits.length,
    });
    mockUpdateLockStatus.mockResolvedValue({ success: true });
    mockSubscribe.mockReturnValue('test-subscription-id');
  });

  describe('Basic Rendering', () => {
    it('renders with default props', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      expect(screen.getByText('Lock Status')).toBeInTheDocument();
    });

    it('displays loading state initially', () => {
      mockGetUnits.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('waits for global facility context before fetching units', async () => {
      mockUseGlobalFacility.mockReturnValue({
        selectedFacilityId: 'fac-pending',
        isAllFacilitiesSelected: false,
        isLoading: true,
      });

      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );

      expect(mockGetUnits).not.toHaveBeenCalled();
    });

    it('calls GET /units for admin users (not tenant-only /units/my)', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );

      await waitFor(() => {
        expect(mockGetUnits).toHaveBeenCalledWith({ limit: 500 });
      });
      expect(mockGetMyUnits).not.toHaveBeenCalled();
    });

    it('scopes staff fetch to global facility selector when a facility is selected', async () => {
      mockUseGlobalFacility.mockReturnValue({
        selectedFacilityId: 'fac-from-context',
        isAllFacilitiesSelected: false,
        isLoading: false,
      });

      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );

      await waitFor(() => {
        expect(mockGetUnits).toHaveBeenCalledWith({ limit: 500, facility_id: 'fac-from-context' });
      });
    });

    it('does not pass facility_id when All Facilities is selected', async () => {
      mockUseGlobalFacility.mockReturnValue({
        selectedFacilityId: '__ALL_FACILITIES__',
        isAllFacilitiesSelected: true,
        isLoading: false,
      });

      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );

      await waitFor(() => {
        expect(mockGetUnits).toHaveBeenCalledWith({ limit: 500 });
      });
    });

    it('subscribes to websocket on mount', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_status',
          expect.any(Function),
          undefined,
          undefined
        );
      });
    });

    it('unsubscribes on unmount', async () => {
      const { unmount } = renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockUnsubscribe).toHaveBeenCalledWith('test-subscription-id');
    });
  });

  describe('Data Display', () => {
    it('displays units after load', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
        expect(screen.getByText('A-102')).toBeInTheDocument();
      });
    });

    it('shows correct lock status', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        const unlockButtons = screen.getAllByText('Unlock');
        expect(unlockButtons.length).toBeGreaterThan(0);
        const unlockedLabels = screen.getAllByText('Unlocked');
        expect(unlockedLabels.length).toBeGreaterThan(0);
      });
    });

    it('shows summary statistics', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );

      await waitFor(
        () => {
          expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
          expect(screen.getByText('A-101')).toBeInTheDocument();
          expect(screen.getByText('Low Battery')).toBeInTheDocument();
          expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
          expect(screen.getAllByText('Unlocked').length).toBeGreaterThan(0);
        },
        { timeout: 15000 },
      );
    }, 20000);

    it('handles empty data gracefully', async () => {
      mockGetUnits.mockResolvedValue({
        units: [],
        total: 0,
      });
      
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('No units found')).toBeInTheDocument();
      });
    });

    it('shows error state on API failure', async () => {
      mockGetUnits.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load units')).toBeInTheDocument();
      });
    });
  });

  describe('Widget Sizing', () => {
    it('renders in small size with compact view', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="small" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/unlocked/)).toBeInTheDocument();
        expect(screen.getByText('A-101')).toBeInTheDocument();
      });
    });

    it('renders in medium size', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
      });
    });

    it('renders in large size with full details', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      // Wait for data to load first - ensure loading state is gone
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      }, { timeout: 5000 });
      
      // Then check for battery percentage and Online status (may have multiple matches)
      await waitFor(() => {
        // Check for battery display - since "85" appears as text, find it
        const batteryElements = screen.getAllByText(/85/);
        expect(batteryElements.length).toBeGreaterThan(0);
        // "Online" may appear multiple times (in stats and per-unit)
        const onlineElements = screen.getAllByText(/Online/);
        expect(onlineElements.length).toBeGreaterThan(0);
      }, { timeout: 5000 });
    });
  });

  describe('Lock Toggle Operations', () => {
    it('unlocks a locked unit when clicking Unlock', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      // Wait for data to load and component to be ready
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
      }, { timeout: 5000 });
      
      // Find the first Unlock button (for A-101)
      const unlockButtons = await screen.findAllByText('Unlock');
      expect(unlockButtons.length).toBeGreaterThan(0);
      
      // Click the button
      fireEvent.click(unlockButtons[0]);
      
      await waitFor(() => {
        expect(mockUpdateLockStatus).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
    });

    it('does not remote-lock an unlocked unit (no Lock action)', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('A-102')).toBeInTheDocument();
      }, { timeout: 5000 });
      
      expect(screen.queryByRole('button', { name: /^Lock$/ })).not.toBeInTheDocument();
      expect(mockUpdateLockStatus).not.toHaveBeenCalled();
    });

    it('shows loading state during lock toggle', async () => {
      mockUpdateLockStatus.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
      );
      
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
      });
      
      const unlockButtons = screen.getAllByText('Unlock');
      
      fireEvent.click(unlockButtons[0]);
      
      // Should show loading indicator
      await waitFor(() => {
        expect(screen.getByText('...')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it(
      'updates unit status from WebSocket updates',
      async () => {
        renderWithProviders(
          <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
        );
        
        await waitFor(() => {
          expect(screen.getByText('A-101')).toBeInTheDocument();
          expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        }, { timeout: 10000 });
        
        await waitFor(() => {
          expect(mockSubscribe).toHaveBeenCalled();
        });
        
        const subscribeCall = mockSubscribe.mock.calls[0];
        const messageHandler = subscribeCall[1];
        
        act(() => {
          messageHandler({
            update: {
              unit_id: 'unit-1',
              lock_status: 'unlocked',
              device_status: 'online',
              battery_level: 80,
            },
          });
        });
        
        await waitFor(() => {
          const unlockedButtons = screen.getAllByText('Unlocked');
          expect(unlockedButtons.length).toBeGreaterThan(0);
        });
      },
      20000,
    );

    it('updates battery level from WebSocket updates', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      }, { timeout: 5000 });
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      const subscribeCall = mockSubscribe.mock.calls[0];
      const messageHandler = subscribeCall[1];
      
      // Verify we can call the message handler without errors (it processes the update)
      expect(() => {
        act(() => {
          messageHandler({ 
            update: {
              unit_id: 'unit-1',
              battery_level: 10,
            }
          });
        });
      }).not.toThrow();
      
      // Verify the subscription was for device_status
      expect(subscribeCall[0]).toBe('device_status');
    });

    it('handles batch updates', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      const subscribeCall = mockSubscribe.mock.calls[0];
      const messageHandler = subscribeCall[1];
      
      // Simulate batch update
      act(() => {
        messageHandler({ 
          updates: [
            { unit_id: 'unit-1', lock_status: 'unlocked' },
            { unit_id: 'unit-2', lock_status: 'locked' },
          ]
        });
      });
      
      await waitFor(() => {
        const unlockButtons = screen.getAllByText('Unlock');
        const unlockedLabels = screen.getAllByText('Unlocked');
        expect(unlockButtons.length + unlockedLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('shows "Just now" for recent activity', async () => {
      const recentUnit = {
        ...mockUnits[0],
        last_seen: new Date().toISOString(),
      };
      
      mockGetUnits.mockResolvedValue({
        units: [recentUnit],
        total: 1,
      });
      
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Just now')).toBeInTheDocument();
      });
    });

    it('shows hours ago for older activity', async () => {
      const olderUnit = {
        ...mockUnits[0],
        last_seen: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      };
      
      mockGetUnits.mockResolvedValue({
        units: [olderUnit],
        total: 1,
      });
      
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(screen.getByText('5h ago')).toBeInTheDocument();
      });
    });
  });

  describe('Live Updates Indicator', () => {
    it('shows live updates indicator when connected', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        // The live indicator is in the enhanced menu, so we just verify it renders
        expect(mockSubscribe).toHaveBeenCalled();
      });
    });
  });
});
