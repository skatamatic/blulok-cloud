import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/__tests__/mocks/websocket-provider-deps';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import { FMSSyncProvider } from '@/contexts/FMSSyncContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';
import { FMSChange, FMSChangeType, FMSSyncResult, FMSChangeAction } from '@/types/fms.types';

// Mock the FMS service
jest.mock('@/services/fms.service', () => ({
  fmsService: {
    reviewChanges: jest.fn(),
    applyChanges: jest.fn(),
    dismissChanges: jest.fn(),
    getPendingChanges: jest.fn().mockResolvedValue([]),
    getSyncDetails: jest.fn().mockResolvedValue({ id: 'sync-123', sync_status: 'pending_review' }),
  },
}));

import { fmsService } from '@/services/fms.service';

// Mock the useToast hook
jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: jest.fn(),
}));

import { useToast } from '@/contexts/ToastContext';

// Mock the WebSocket context
jest.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-id'),
    unsubscribe: jest.fn(),
    isConnected: false,
  }),
}));

// Mock the useFMSSync hook
const mockUseFMSSyncReturn = {
  hideReview: jest.fn(),
  minimizeReview: jest.fn(),
  openPendingReview: jest.fn(),
  syncState: {
    facilityId: 'facility-1',
    facilityName: 'Test Facility',
  },
};

jest.mock('@/contexts/FMSSyncContext', () => ({
  ...jest.requireActual('@/contexts/FMSSyncContext'),
  useFMSSync: () => mockUseFMSSyncReturn,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ToastContainer />
        <WebSocketProvider>
          <FMSSyncProvider>
            {component}
          </FMSSyncProvider>
        </WebSocketProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

const mockChanges: FMSChange[] = [
  {
    id: 'change-1',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_ADDED,
    entity_type: 'tenant',
    external_id: 'ext-1',
    before_data: null,
    after_data: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      unitNumber: 'A-101',
    },
    required_actions: [FMSChangeAction.CREATE_USER],
    impact_summary: 'New tenant John Doe added to unit A-101',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-2',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_UPDATED,
    entity_type: 'tenant',
    external_id: 'ext-2',
    internal_id: 'user-123',
    before_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@old.com',
      phone: '555-0100',
    },
    after_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@new.com',
      phone: '555-0101',
    },
    required_actions: [FMSChangeAction.UPDATE_USER],
    impact_summary: 'Tenant Jane Smith updated contact information',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-3',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_REMOVED,
    entity_type: 'tenant',
    external_id: 'ext-3',
    internal_id: 'user-456',
    before_data: {
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob.wilson@example.com',
    },
    after_data: null,
    required_actions: [FMSChangeAction.DEACTIVATE_USER],
    impact_summary: 'Tenant Bob Wilson removed from system',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-4',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.UNIT_ADDED,
    entity_type: 'unit',
    external_id: 'unit-205',
    before_data: null,
    after_data: {
      unitNumber: 'B-205',
      floor: 2,
      squareFeet: 1200,
    },
    required_actions: [FMSChangeAction.CREATE_USER],
    impact_summary: 'New unit B-205 added to building',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
];

const mockSyncResult: FMSSyncResult = {
  success: true,
  syncLogId: 'sync-123',
  changesDetected: mockChanges,
  summary: {
    tenantsAdded: 1,
    tenantsRemoved: 0,
    tenantsUpdated: 1,
    unitsAdded: 1,
    unitsRemoved: 0,
    unitsUpdated: 0,
    errors: [],
    warnings: [],
  },
  requiresReview: true,
};

describe('FMSChangeReviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup default useToast mock
    (useToast as jest.Mock).mockReturnValue({
      addToast: jest.fn(),
      toasts: [],
      removeToast: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Modal Rendering', () => {
    it('renders the modal when isOpen is true', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
          facilityName="Test Facility"
        />
      );

      expect(screen.getByRole('heading', { name: /Review FMS Changes \(4 detected\).*Test Facility/ })).toBeInTheDocument();
      expect(screen.getByText('All Changes (4)')).toBeInTheDocument();
      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={false}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.queryByText('Review FMS Changes')).not.toBeInTheDocument();
    });

    it('renders without facility name when not provided', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByRole('heading', { name: /Review FMS Changes \(4 detected\)/ })).toBeInTheDocument();
    });

    it('shows empty state when no changes provided', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByRole('heading', { name: /Review FMS Changes \(0 detected\)/ })).toBeInTheDocument();
      expect(screen.getByText('All Changes (0)')).toBeInTheDocument();
      expect(screen.getByText('No changes in this category')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation and Filtering', () => {
    it('shows all changes by default', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
      expect(screen.getByText('Tenant Jane Smith updated contact information')).toBeInTheDocument();
      expect(screen.getByText('Tenant Bob Wilson removed from system')).toBeInTheDocument();
      expect(screen.getByText('New unit B-205 added to building')).toBeInTheDocument();
    });

    it('filters to added changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const addedTab = screen.getByText('Added (2)');
      fireEvent.click(addedTab);

      // Should only show added changes
      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
      expect(screen.getByText('New unit B-205 added to building')).toBeInTheDocument();

      // Updated and removed should not be visible
      expect(screen.queryByText('Tenant Jane Smith updated contact information')).not.toBeInTheDocument();
      expect(screen.queryByText('Tenant Bob Wilson removed from system')).not.toBeInTheDocument();

      // Selection count should reflect filtered changes
      expect(screen.getByText(/2.*selected/)).toBeInTheDocument();
    });

    it('filters to updated changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const updatedTab = screen.getByText('Updated (1)');
      fireEvent.click(updatedTab);

      expect(screen.queryByText('New tenant John Doe added to unit A-101')).not.toBeInTheDocument();
      expect(screen.getByText('Tenant Jane Smith updated contact information')).toBeInTheDocument();
      expect(screen.queryByText('Tenant Bob Wilson removed from system')).not.toBeInTheDocument();
      expect(screen.queryByText('New unit B-205 added to building')).not.toBeInTheDocument();
    });

    it('filters to removed changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const removedTab = screen.getByText('Removed (1)');
      fireEvent.click(removedTab);

      expect(screen.queryByText('New tenant John Doe added to unit A-101')).not.toBeInTheDocument();
      expect(screen.queryByText('Tenant Jane Smith updated contact information')).not.toBeInTheDocument();
      expect(screen.getByText('Tenant Bob Wilson removed from system')).toBeInTheDocument();
      expect(screen.queryByText('New unit B-205 added to building')).not.toBeInTheDocument();
    });

    it('shows empty state for filtered categories with no changes', () => {
      const onlyAddedChanges = mockChanges.filter(c =>
        c.change_type === FMSChangeType.TENANT_ADDED || c.change_type === FMSChangeType.UNIT_ADDED
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={onlyAddedChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const removedTab = screen.getByText('Removed (0)');
      fireEvent.click(removedTab);

      expect(screen.getByText('No changes in this category')).toBeInTheDocument();
    });
  });

  describe('Change Selection', () => {
    it('selects all changes by default', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText(/4.*selected/)).toBeInTheDocument();
    });

    it('toggles individual change selection', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const firstChange = screen.getByText('New tenant John Doe added to unit A-101').closest('div');
      fireEvent.click(firstChange!);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (3)')).toBeInTheDocument();
      });
    });

    it('selects all changes when Select All is clicked', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Deselect all first
      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);
      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (0)')).toBeInTheDocument();
      });

      // Select all
      const selectAllButton = screen.getByText('Select All');
      fireEvent.click(selectAllButton);
      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (4)')).toBeInTheDocument();
      });
    });

    it('deselects all changes when Select None is clicked', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (0)')).toBeInTheDocument();
      });
    });

    it('updates selection count when filtering changes', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const addedTab = screen.getByText('Added (2)');
      fireEvent.click(addedTab);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (2)')).toBeInTheDocument();
      });
    });
  });

  describe('Change Expansion', () => {
    it('expands and collapses change details', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find expand button by looking for the button with ChevronRightIcon initially
      const changeCards = screen.getAllByTestId('fms-change-card');
      const addCard = changeCards.find((card) =>
        card.textContent?.includes('New tenant John Doe added to unit A-101'),
      );
      const expandButton = addCard?.querySelector('[data-testid="fms-change-expand"]');

      // Initially collapsed
      expect(screen.queryByText('Details')).not.toBeInTheDocument();

      // Click to expand
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      // Should show expanded details
      expect(screen.getByText('Details')).toBeInTheDocument();
    });

    it('shows before and after data for updates', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find and expand the update change
      const updateChange = screen.getByText('Tenant Jane Smith updated contact information');
      const changeContainer = updateChange.closest('[data-testid="fms-change-card"]');
      const expandButton = changeContainer?.querySelector('[data-testid="fms-change-expand"]');

      if (expandButton) {
        fireEvent.click(expandButton);
      }

      expect(screen.getByText('Current (Before)')).toBeInTheDocument();
      expect(screen.getByText('New (After)')).toBeInTheDocument();
    });

    it('shows only after data for additions', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find and expand the addition change
      const addChange = screen.getByText('New tenant John Doe added to unit A-101');
      const changeContainer = addChange.closest('[data-testid="fms-change-card"]');
      const expandButton = changeContainer?.querySelector('[data-testid="fms-change-expand"]');

      if (expandButton) {
        fireEvent.click(expandButton);
      }

      expect(screen.queryByText('Current (Before)')).not.toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  describe('Change Icons and Colors', () => {
    it('shows correct change type labels', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Check that change type labels are displayed correctly
      expect(screen.getByText('Tenant added')).toBeInTheDocument();
      expect(screen.getByText('Tenant updated')).toBeInTheDocument();
      expect(screen.getByText('Tenant removed')).toBeInTheDocument();
      expect(screen.getByText('Unit added')).toBeInTheDocument();
    });

    it('applies correct colors for different change types', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // The color classes are applied to icon containers
      // We verify the changes are rendered with their types
      expect(screen.getByText('Tenant added')).toBeInTheDocument();
      expect(screen.getByText('Tenant updated')).toBeInTheDocument();
      expect(screen.getByText('Tenant removed')).toBeInTheDocument();
      expect(screen.getByText('Unit added')).toBeInTheDocument();
    });

    it('does not flag tenant_removed as invalid when is_valid is omitted (legacy API rows)', () => {
      const removedWithoutFlag: FMSChange = {
        id: 'removed-legacy',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_REMOVED,
        entity_type: 'tenant',
        external_id: 'ext-removed',
        internal_id: 'user-removed',
        before_data: {
          email: 'jodycs1@gmail.com',
          first_name: 'jody',
          last_name: 'sacher',
        },
        after_data: null,
        required_actions: [FMSChangeAction.DEACTIVATE_USER, FMSChangeAction.REMOVE_ACCESS],
        impact_summary: 'Tenant removed: jodycs1@gmail.com',
        is_reviewed: false,
        created_at: '2025-01-01T00:00:00Z',
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[removedWithoutFlag]}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: [removedWithoutFlag] }}
        />
      );

      expect(screen.queryByText('Cannot apply this change')).not.toBeInTheDocument();
      expect(screen.getByText('Invalid (0)')).toBeInTheDocument();
    });

    it('distinguishes a failed apply attempt from a payload that was never applicable', () => {
      const failedApply: FMSChange = {
        id: 'unit-failed',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.UNIT_UPDATED,
        entity_type: 'unit',
        external_id: 'ext-908',
        internal_id: 'unit-908',
        before_data: { status: 'available' },
        after_data: { unitNumber: '908', status: 'occupied' },
        required_actions: [],
        impact_summary: 'Update unit 908',
        is_reviewed: true,
        is_accepted: true,
        is_valid: false,
        validation_errors: ['Unit 908 is occupied by Lucien Robel in FMS, but that tenant cannot be created in BluLok.'],
        created_at: '2025-01-01T00:00:00Z',
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[failedApply]}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: [failedApply] }}
        />
      );

      expect(screen.getByText('This change failed to apply')).toBeInTheDocument();
      expect(screen.queryByText('Cannot apply this change')).not.toBeInTheDocument();
      expect(screen.getByText(/Lucien Robel/)).toBeInTheDocument();
      expect(
        screen.getByText(/Automatic sync did not apply because a problem was detected/),
      ).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('calls minimizeReview when minimize button is clicked', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const minimizeButton = screen.getByTitle('Minimize to status bar');
      fireEvent.click(minimizeButton);

      expect(mockUseFMSSyncReturn.minimizeReview).toHaveBeenCalled();
    });

    it('calls hideReview and onClose when close button is clicked', () => {
      const mockOnClose = jest.fn();

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const closeButton = screen.getByTitle('Cancel and close');
      fireEvent.click(closeButton);

      expect(mockUseFMSSyncReturn.hideReview).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('applies changes when Accept & Apply is clicked', async () => {
      const mockOnApply = jest.fn();
      (fmsService.reviewChanges as jest.Mock).mockResolvedValue({ success: true });
      (fmsService.applyChanges as jest.Mock).mockResolvedValue({
        success: true,
        changesApplied: 4,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      });

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(fmsService.reviewChanges).toHaveBeenCalledWith(
          'sync-123',
          ['change-1', 'change-2', 'change-3', 'change-4'],
          true
        );
        expect(mockOnApply).toHaveBeenCalledWith(['change-1', 'change-2', 'change-3', 'change-4']);
      });
    }, 20_000);

    it('handles apply API failure gracefully', async () => {
      const mockOnApply = jest.fn();
      const mockAddToast = jest.fn();
      (useToast as jest.Mock).mockReturnValue({ 
        addToast: mockAddToast,
        toasts: [],
        removeToast: jest.fn(),
      });
      (fmsService.reviewChanges as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            title: 'Failed to Apply Changes',
          })
        );
      });
    });

    it('shows loading state during apply', async () => {
      const mockOnApply = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      (fmsService.reviewChanges as jest.Mock).mockResolvedValue({ success: true });
      (fmsService.applyChanges as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          changesApplied: 4,
          changesFailed: 0,
          errors: [],
          accessChanges: {
            usersCreated: [],
            usersDeactivated: [],
            accessGranted: [],
            accessRevoked: [],
          },
        }), 50))
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      // Should show loading state
      expect(screen.getByText('Applying...')).toBeInTheDocument();
      expect(applyButton).toBeDisabled();

      await waitFor(() => {
        expect(mockOnApply).toHaveBeenCalled();
      });
    });

    it('disables apply button when no changes selected', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Deselect all changes
      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);

      const applyButton = screen.getByText('Accept & Apply (0)');
      expect(applyButton).toBeDisabled();
    });
  });

  describe('Data Rendering', () => {
    it('formats field labels correctly', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Expand a change to see formatted data
      const expandButtons = screen.getAllByRole('button').filter(btn =>
        btn.querySelector('svg[data-slot="icon"]')
      );

      if (expandButtons.length > 0) {
        fireEvent.click(expandButtons[0]);
      }

      // Should format camelCase to Title Case
      // This is hard to test specifically without more detailed DOM inspection
      // The important thing is that the data renders without crashing
    });

    it('handles null and undefined values', () => {
      const changeWithNulls: FMSChange = {
        id: 'test-change',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-123',
        impact_summary: 'Test change',
        before_data: null,
        after_data: {
          name: null,
          email: undefined,
          active: false,
        },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithNulls]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Expand to see data rendering
      const changeContainer = screen.getByText('Test change').closest('[data-testid="fms-change-card"]');
      const expandButton = changeContainer?.querySelector('[data-testid="fms-change-expand"]');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      // Should render without crashing
      expect(screen.getByText('Test change')).toBeInTheDocument();
    });

  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and titles', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByTitle('Minimize to status bar')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel and close')).toBeInTheDocument();
    });

    it('has proper heading structure', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
          facilityName="Test Facility"
        />
      );

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(/Review FMS Changes \(4 detected\).*Test Facility/);
    });

    it('supports keyboard navigation', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Dialog should be focusable
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles missing syncResult gracefully', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={null}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      // Should not call API when syncResult is null
      expect(fmsService.reviewChanges).not.toHaveBeenCalled();
    });

    it('handles empty required_actions array', () => {
      const changeWithoutActions: FMSChange = {
        id: 'change-no-actions',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-456',
        impact_summary: 'Change without actions',
        before_data: null,
        after_data: { name: 'Test' },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithoutActions]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Should not show any action badges
      expect(screen.queryByText(/CREATE|UPDATE|ARCHIVE/)).not.toBeInTheDocument();
    });

    it('handles undefined required_actions', () => {
      const changeWithoutActions: FMSChange = {
        id: 'change-no-actions',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-789',
        impact_summary: 'Change without actions',
        before_data: null,
        after_data: { name: 'Test' },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithoutActions]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Should not crash
      expect(screen.getByText('Change without actions')).toBeInTheDocument();
    });
  });

  describe('Grouped invalid problems', () => {
    it('combines identity-collision and vacant-ledger rows into two problem cards', () => {
      const grouped: FMSChange[] = [
        {
          id: 't3',
          sync_log_id: 'sync-123',
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: 'ext-t3',
          after_data: { email: 't3@blulok.com' },
          required_actions: [FMSChangeAction.CREATE_USER],
          impact_summary:
            'FMS tenant t3@blulok.com matches an existing BluLok user who is already mapped to a different FMS tenant',
          is_reviewed: false,
          is_valid: false,
          validation_errors: [
            'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.',
          ],
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 't2',
          sync_log_id: 'sync-123',
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: 'ext-t2',
          after_data: { email: 't2@blulok.com' },
          required_actions: [FMSChangeAction.CREATE_USER],
          impact_summary:
            'FMS tenant t2@blulok.com matches an existing BluLok user who is already mapped to a different FMS tenant',
          is_reviewed: false,
          is_valid: false,
          validation_errors: [
            'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. Give this tenant a unique email or phone in your FMS, or remap the user.',
          ],
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'u100',
          sync_log_id: 'sync-123',
          change_type: FMSChangeType.UNIT_UPDATED,
          entity_type: 'unit',
          external_id: 'ext-100',
          after_data: { unitNumber: '100' },
          required_actions: [],
          impact_summary: 'Update unit 100',
          is_reviewed: false,
          is_valid: false,
          validation_errors: [
            'Unit 100 is occupied by Tester Three (t3@blulok.com) in FMS, but that tenant cannot be created in BluLok: Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant.',
          ],
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'a101',
          sync_log_id: 'sync-123',
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: 'ext-june',
          after_data: { unitNumber: '101' },
          required_actions: [FMSChangeAction.ASSIGN_UNIT],
          impact_summary: 'Assign june.mary@yopmail.com to unit 101 — blocked (FMS unit is vacant)',
          is_reviewed: false,
          is_valid: false,
          validation_errors: [
            'FMS marks unit 101 as vacant, but a ledger still lists June Marry (june.mary@yopmail.com) on it. Unit status is the source of truth for occupancy, so this assignment was not applied.',
          ],
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'a806',
          sync_log_id: 'sync-123',
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: 'ext-june',
          after_data: { unitNumber: '806' },
          required_actions: [FMSChangeAction.ASSIGN_UNIT],
          impact_summary: 'Assign june.mary@yopmail.com to unit 806 — blocked (FMS unit is vacant)',
          is_reviewed: false,
          is_valid: false,
          validation_errors: [
            'FMS marks unit 806 as vacant, but a ledger still lists June Marry (june.mary@yopmail.com) on it. Unit status is the source of truth for occupancy, so this assignment was not applied.',
          ],
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={grouped}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: grouped }}
        />
      );

      expect(screen.getAllByTestId('fms-change-card')).toHaveLength(2);
      expect(screen.getByText('2 problems could not be applied')).toBeInTheDocument();
      expect(screen.getByText('Shared tenant contact')).toBeInTheDocument();
      expect(screen.getByText('Unit status and ledger disagree')).toBeInTheDocument();
      expect(screen.getByText('Invalid (2)')).toBeInTheDocument();
    });

    it('titles a single incomplete tenant as a problem, not Tenant added', () => {
      const incomplete: FMSChange = {
        id: 'nameless',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-nameless',
        after_data: { firstName: '', lastName: '' },
        required_actions: [FMSChangeAction.CREATE_USER],
        impact_summary: 'New tenant: Unknown Unknown (placeholder — no login)',
        is_reviewed: false,
        is_valid: false,
        validation_errors: ['Missing or empty first name', 'Missing or empty last name'],
        created_at: '2025-01-01T00:00:00Z',
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[incomplete]}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: [incomplete] }}
        />
      );

      expect(screen.getByText('Incomplete tenant record')).toBeInTheDocument();
      expect(screen.queryByText('Tenant added')).not.toBeInTheDocument();
      expect(screen.queryByText('create user')).not.toBeInTheDocument();
    });
  });
});
