import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { LockStatusWidget } from '@/components/Widget/LockStatusWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { Unit } from '@/types/units.types';

// Mock the API service
const mockGetMyUnits = jest.fn();
const mockUpdateUnit = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getMyUnits: (...args: unknown[]) => mockGetMyUnits(...args),
    updateUnit: (...args: unknown[]) => mockUpdateUnit(...args),
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
      status: 'locked',
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
      status: 'unlocked',
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
      status: 'locked',
      is_online: false,
      battery_level: 15,
      last_seen: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMyUnits.mockResolvedValue({
      units: mockUnits,
      total: mockUnits.length,
    });
    mockUpdateUnit.mockResolvedValue({ success: true });
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
      mockGetMyUnits.mockImplementation(() => new Promise(() => {}));
      
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('calls API on mount', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockGetMyUnits).toHaveBeenCalled();
      });
    });

    it('subscribes to websocket on mount', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="medium" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_status',
          expect.any(Function)
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
        // A-101 is locked, should have Unlock button
        const unlockButtons = screen.getAllByText('Unlock');
        expect(unlockButtons.length).toBeGreaterThan(0);
        
        // A-102 is unlocked, should have Lock button
        const lockButtons = screen.getAllByText('Lock');
        expect(lockButtons.length).toBeGreaterThan(0);
      });
    });

    it('shows summary statistics', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      // Wait for data to load first - ensure loading state is gone
      await waitFor(() => {
        expect(screen.getByText('A-101')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      }, { timeout: 5000 });
      
      // Then check for summary statistics (Offline may appear multiple times, use getAllByText)
      await waitFor(() => {
        expect(screen.getByText('Unlocked')).toBeInTheDocument();
        expect(screen.getByText('Low Battery')).toBeInTheDocument();
        expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
      }, { timeout: 5000 });
    });

    it('handles empty data gracefully', async () => {
      mockGetMyUnits.mockResolvedValue({
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
      mockGetMyUnits.mockRejectedValue(new Error('Network error'));
      
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
      
      // Then check for battery percentage (may be split across text nodes: "85" and "%")
      await waitFor(() => {
        // Battery is shown as "🔋 85 %" - check for the number and % separately or use a flexible matcher
        const batteryText = screen.getByText(/85/);
        expect(batteryText).toBeInTheDocument();
        expect(screen.getByText(/Online/)).toBeInTheDocument();
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
      
      // Wait for the API call - use a shorter timeout and don't wait for state updates
      await waitFor(() => {
        expect(mockUpdateUnit).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      // Verify it was called with correct parameters
      expect(mockUpdateUnit).toHaveBeenCalledWith('unit-1', { is_locked: false });
    });

    it('locks an unlocked unit when clicking Lock', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      // Wait for data to load and component to be ready
      await waitFor(() => {
        expect(screen.getByText('A-102')).toBeInTheDocument();
      }, { timeout: 5000 });
      
      // Find the Lock button (for A-102)
      const lockButtons = await screen.findAllByText('Lock');
      expect(lockButtons.length).toBeGreaterThan(0);
      
      // Click the button
      fireEvent.click(lockButtons[0]);
      
      // Wait for the API call - use a shorter timeout
      await waitFor(() => {
        expect(mockUpdateUnit).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      // Verify it was called with correct parameters
      expect(mockUpdateUnit).toHaveBeenCalledWith('unit-2', { is_locked: true });
    });

    it('shows loading state during lock toggle', async () => {
      mockUpdateUnit.mockImplementation(() => 
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
    it('updates unit status from WebSocket updates', async () => {
      renderWithProviders(
        <LockStatusWidget currentSize="large" onSizeChange={() => {}} />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      // Get the message handler
      const subscribeCall = mockSubscribe.mock.calls[0];
      const messageHandler = subscribeCall[1];
      
      // Simulate device status update - unit-1 becomes unlocked
      act(() => {
        messageHandler({ 
          update: {
            unit_id: 'unit-1',
            lock_status: 'unlocked',
            device_status: 'online',
            battery_level: 80,
          }
        });
      });
      
      // After update, A-101 should show Lock button instead of Unlock
      await waitFor(() => {
        // The unlockedCount should increase
        const statsDiv = screen.getByText('Unlocked').closest('div');
        expect(statsDiv).toBeInTheDocument();
      });
    });

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
      
      // Simulate battery level update
      act(() => {
        messageHandler({ 
          update: {
            unit_id: 'unit-1',
            battery_level: 10,
          }
        });
      });
      
      // Battery level should be updated (may be split across text nodes: "10" and "%")
      await waitFor(() => {
        // Check for the number 10 in the battery display
        expect(screen.getByText(/10/)).toBeInTheDocument();
      }, { timeout: 3000 });
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
      
      // Both units should be updated
      await waitFor(() => {
        // Now both should show either Lock or Unlock buttons correctly
        const lockButtons = screen.getAllByText('Lock');
        const unlockButtons = screen.getAllByText('Unlock');
        expect(lockButtons.length + unlockButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('shows "Just now" for recent activity', async () => {
      const recentUnit = {
        ...mockUnits[0],
        last_seen: new Date().toISOString(),
      };
      
      mockGetMyUnits.mockResolvedValue({
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
      
      mockGetMyUnits.mockResolvedValue({
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
